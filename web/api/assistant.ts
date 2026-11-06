import { ApiError, FinishReason, GoogleGenAI } from '@google/genai'
import { z } from 'zod'

// Sine's only server code: it exists to keep GEMINI_API_KEY out of the browser. It proposes playlists and never
// touches the user's library; the app creates a playlist itself, with the user's own Spotify sign-in, after they confirm.

const DEFAULT_MODEL = 'gemini-3.8-flash'

const SYSTEM = `You help people build Spotify playlists inside a music app called Sine.

Reply with a short, friendly message and, when the person wants a playlist, a proposed playlist.
- Include every song they name, in the order they give.
- Use the playlist name they give. If they don't give one, pick a short, natural name.
- If they ask for suggestions (for example "10 more like this"), suggest real, released songs that you're confident exist.
- Give each song's exact title and main artist, so it can be found by search. Use an empty artist if you can't tell.
- Propose at most 100 songs.
- When they change a playlist you proposed earlier, return the complete updated playlist.
- If they aren't asking for a playlist, set playlist to null and say what you can help with.

The app shows the playlist for them to review, so don't ask for confirmation or claim that it has been created.`

const Proposal = z.object({
  reply: z.string(),
  playlist: z
    .object({
      name: z.string(),
      description: z.string(),
      songs: z.array(z.object({ title: z.string(), artist: z.string() })),
    })
    .nullable(),
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
    const response = await new GoogleGenAI({ apiKey, httpOptions: { timeout: 90_000 } }).models.generateContent({
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
      // Gemini reports a bad API key as a 400.
      if (e.status === 400 || e.status === 401 || e.status === 403)
        return fail(503, "The assistant isn't set up correctly. Check its API key and model.")
    }
    return fail(502, "The assistant couldn't respond. Try again in a moment.")
  }
}
