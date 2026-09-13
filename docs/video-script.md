# Demo video script (target ≈ 3 min 30 s, limit 5 min)

Voiceover: `edge-tts`, voice `en-US-AndrewNeural`. Visuals: real screen captures of the live site
(`syllabus-arrow.vercel.app`) and slides printed from `/deck`, assembled with ffmpeg.

| # | Visual | Voiceover |
|---|---|---|
| 1 | Deck slide 1 | Every student gets a syllabus in week one, and a panic in week eleven. This is Syllabus Arrow: a term plan that knows what you can't do yet — including the things you think you can. |
| 2 | Deck slide 2 | A syllabus tells you when topics are taught. It never tells you what depends on what. So students plan by the calendar, tick topics off after reading them, and find the gaps when the exam does. |
| 3 | Landing page | Syllabus Arrow is a SaaS product for students. Sign up with a verified email, or try the demo course with no account at all. |
| 4 | Onboarding → upload → processing steps | You name a course, set your exam date and daily study time, and upload the syllabus PDF. A background job reads it — and every step you see is the job's real progress, not a timer. |
| 5 | Map, topic selected | You get the prerequisite map. Tap a topic, and you see what it needs, what it unlocks, and the reason for every arrow. None of these links are in the syllabus — they're inferred from the subject, and checked by code: dangling edges and cycles are removed before anything is saved. |
| 6 | Schedule | The schedule puts every topic after its prerequisites and works back from the deadlines it found, with spaced reviews. If time runs out it says which topics will be late. And if the syllabus has no dates, it asks for your exam date instead of guessing. |
| 7 | Practice, answered | Then you practise. Every question's answer key has been confirmed by a second, blind solve — questions where the two disagree are never shown. Each answer updates a Bayesian Knowledge Tracing estimate, and if a question is wrong, you flag it and it stops counting. |
| 8 | Insights | Here's the moment it exists for. This student marked Gaussian elimination as done. But five of six answers on topics that depend on it were wrong — and fifteen of eighteen exam topics depend on it. Syllabus Arrow only says this when the evidence is real: a topic you claimed, at least three answers, and mostly wrong. |
| 9 | Deck slide 3 | That's the design rule. The model writes the map and the questions. Code decides what you know. The scheduler, the mastery model, the insights and the plan limits never call a model — and our CI fails the build if they ever could. |
| 10 | Pricing page | Free covers one course. Pro, eight dollars a month, unlocks every course, unlimited practice, and past papers: exam questions mapped onto the graph, so topics worth more marks come first. Checkout runs through Polar, and the same plan table drives the pricing page and every limit on the server. |
| 11 | Deck slide 7 | Under the hood: Next.js on Vercel, Better Auth, Neon Postgres behind a single tenancy layer, private blob storage, Inngest jobs, and Gemini behind a model fallback chain with a cache and a daily cap. |
| 12 | Deck slide 10 | Syllabus Arrow. Try the demo course at syllabus-arrow dot vercel dot app. |
