/* ===================================================
   THUNDER'S DIARY — /api/chat
   Vercel serverless function. Keeps the Groq key secret.

   Set this in your Vercel project's Environment Variables:
     GROQ_API_KEY = your_groq_key_here

   EDIT the MODEL constants below to change models.
   =================================================== */

const TEXT_MODEL = "llama-3.3-70b-versatile";        // EDIT: text-only model
const VISION_MODEL = "llama-4-scout-17b-16e-instruct"; // EDIT: handwriting-reading model

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { profile, question, image, recentEntries } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "Server is missing GROQ_API_KEY" });
    return;
  }

  const persona = buildPersona(profile, recentEntries);

  try {
    let transcribedQuestion = question;
    let messages;

    if (image) {
      // Touch/pen input: ask a vision-capable model to read the handwriting AND reply in character
      messages = [
        { role: "system", content: persona },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Read the handwritten page in this image, then reply to it as the diary, in character. First give the transcription on a line starting with 'TRANSCRIPT:' then a line '---' then your reply.",
            },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ];

      const groqRes = await callGroq(apiKey, VISION_MODEL, messages);
      const raw = groqRes.choices?.[0]?.message?.content || "";
      const parts = raw.split("---");
      transcribedQuestion = (parts[0] || "").replace("TRANSCRIPT:", "").trim();
      const reply = (parts[1] || raw).trim();
      res.status(200).json({ reply, transcribedQuestion });
      return;
    }

    // Typed input: plain text chat
    messages = [
      { role: "system", content: persona },
      { role: "user", content: question },
    ];

    const groqRes = await callGroq(apiKey, TEXT_MODEL, messages);
    const reply = groqRes.choices?.[0]?.message?.content || "";
    res.status(200).json({ reply, transcribedQuestion });
  } catch (err) {
    res.status(500).json({ error: "oracle_failed", detail: String(err) });
  }
};

async function callGroq(apiKey, model, messages) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 500,       // EDIT: reply length cap
      temperature: 0.8,      // EDIT: creativity level
    }),
  });
  if (!r.ok) throw new Error(`Groq error ${r.status}`);
  return r.json();
}

function buildPersona(profile = {}, recentEntries = []) {
  const name = profile?.name || "friend";
  const gender = profile?.gender || "they";
  const purpose = profile?.purpose || "both";

  const pronounLine =
    gender === "she" ? "Refer to them as she/her when needed."
    : gender === "he" ? "Refer to them as he/him when needed."
    : "Refer to them as they/them when needed.";

  const purposeLine =
    purpose === "study"
      ? "They mostly use this diary to help with studying — be encouraging, clear, and practical, like a warm study companion."
      : purpose === "personal"
      ? "They mostly use this diary for personal thoughts and feelings — listen closely, be gentle and supportive, and don't rush to give advice unless asked."
      : "They use this diary for both studying and personal reflection — read the tone of what they write and respond accordingly.";

  const historyLine = recentEntries?.length
    ? "Recent past pages (for continuity, do not repeat them back verbatim): " +
      recentEntries.map(e => `[${e.question} -> ${e.answer}]`).join(" | ")
    : "";

  return [
    `You are the spirit of "Thunder's Diary," a warm, caring personal diary that writes back to ${name}.`,
    pronounLine,
    purposeLine,
    "Speak directly to them, briefly and warmly, like a diary that truly knows and cares about them. Keep replies under 80 words unless they clearly need more. Never mention that you are an AI or a language model — stay fully in character as their diary.",
    historyLine,
  ].filter(Boolean).join(" ");
}
