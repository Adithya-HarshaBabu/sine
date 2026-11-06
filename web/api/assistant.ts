import { ApiError, FinishReason, GoogleGenAI } from '@google/genai'
import { z } from 'zod'

// Sine's only server code: it exists to keep GEMINI_API_KEY out of the browser. It proposes playlists and never
// touches the user's library; the app creates a playlist itself, with the user's own Spotify sign-in, after they confirm.

// The larger Flash models can take over a minute on the free tier, which is too slow for a chat.
const DEFAULT_MODEL = 'gemini-3.5-flash-lite'

const SYSTEM = `You help people find songs and build Spotify playlists inside a music app called Sine.

Always reply with a short, friendly message. Then choose what the person wants:

Songs to listen to: they name a song, ask to play or find something, or ask for recommendations without mentioning a playlist. A song name on its own counts. Put the songs in "songs", at most 20, and set "playlist" to null. The app shows each song with a play button, so don't say that it's playing.

A playlist: they ask for a playlist, or to save or add songs to one. Put it in "playlist" and leave "songs" empty.
- Include every song they name, in the order they give.
- Use the playlist name they give. If they don't give one, pick a short, natural name.
- Propose at most 100 songs.
- When they change a playlist you proposed earlier, return the complete updated playlist.
- The app shows the playlist for them to review, so don't ask for confirmation or claim that it has been created.

Anything else: leave "songs" empty, set "playlist" to null and say what you can help with.

For every song, give its exact title and main artist, so it can be found by search. Use an empty artist if you can't tell. When suggesting songs (for example "10 more like this"), suggest only real, released songs that you're confident exist.`

const Song = z.object({ title: z.string(), artist: z.string() })

const Proposal = z.object({
  reply: z.string(),
  songs: z.array(Song),
  playlist: z.object({ name: z.string(), description: z.string(), songs: z.array(Song) }).nullable(),
})

const { $schema: _draft, ...responseSchema } = z.toJSONSchema(Proposal)

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(20_000) }))
    .min(1)
    .max(40)
    .refine((m) => m[0]?.role === 'user' && m.at(-1)?.role === 'user', 'Conversation must start and end with the user'),
})

const fail = (status: number, error: string) => Response.json({ error }, { status })

/** Returns the Spotify user behind the token, or null if the token isn't valid. */
async function spotifyUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const res = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: auth } })
  if (!res.ok) return null
  return ((await res.json()) as { id: string }).id
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fail(503, "The assistant isn't set up yet: GEMINI_API_KEY is missing.")

  // The free quota is shared by everyone, so only signed-in Spotify users get through, and optionally only listed ones.
  const userId = await spotifyUserId(request).catch(() => null)
  if (!userId) return fail(401, 'Log in again to use the assistant.')
  const allowed = process.env.ASSISTANT_ALLOWED_USERS?.split(',').map((id) => id.trim())
  if (allowed && !allowed.includes(userId)) return fail(403, "This account can't use the assistant.")

  const body = Body.safeParse(await request.json().catch(() => null))
  if (!body.success) return fail(400, "That message couldn't be sent. Try starting a new chat.")

  try {
    const response = await new GoogleGenAI({ apiKey, httpOptions: { timeout: 45_000 } }).models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: body.data.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: SYSTEM,
        maxOutputTokens: 16_000,
        responseMimeType: 'application/json',
        responseJsonSchema: responseSchema,
      },
    })

    const candidate = response.candidates?.[0]
    if (!candidate || response.promptFeedback?.blockReason || candidate.finishReason === FinishReason.SAFETY)
      return fail(422, "The assistant can't help with that request.")
    if (candidate.finishReason === FinishReason.MAX_TOKENS)
      return fail(502, 'That reply was incomplete. Try asking for fewer songs.')

    let parsed: unknown
    try {
      parsed = JSON.parse(response.text ?? '')
    } catch {
      parsed = null
    }
    const proposal = Proposal.safeParse(parsed)
    if (!proposal.success) return fail(502, "The assistant's reply didn't make sense. Try again.")
    return Response.json(proposal.data)
  } catch (e) {
    console.error('Gemini request failed', e)
    if (e instanceof ApiError) {
      if (e.status === 429) return fail(429, 'The assistant has reached its free limit for now. Try again later.')
      if (e.status === 504) return fail(504, 'Gemini took too long to reply. Try again, or ask for fewer songs.')
      // Gemini reports a bad API key as a 400.
      if (e.status === 400 || e.status === 401 || e.status === 403)
        return fail(503, "The assistant isn't set up correctly. Check its API key and model.")
    }
    return fail(502, "The assistant couldn't respond. Try again in a moment.")
  }
}
