# AI voices and media: options for voices, SFX, images and video (research, 2026-11-20)

Research only. Nothing here is built, no account was created, and no API was called. All web
sources were read on **2026-11-20**. Terms change often, so re-read them before any generation run.
Counts come from a one-off script over `content/packs`, `content/story` and `content/quests`
(scratch folder, not in the repo).

**Short answer**

- **The ElevenLabs free tier doesn't fit a public MIT repo.** Its output is non-commercial only and
  needs "elevenlabs.io" credited in the title. The quota is **10,000 credits a month, not per day**,
  and unused credits don't roll over. The game's 80.6k characters would take 8 to 12 months of free
  quota. The free tier also allows only 3 designed voices, and its API can't use Voice Library voices.
- **Paid ElevenLabs is cheap for this volume.** At the API list price, all dialogue costs about
  $6.50, or about $10 with retakes. One or two months of Starter ($6 a month) covers it and includes
  the commercial licence.
- **Never use ElevenLabs SFX or music for files in the repo, even on a paid plan.** The SFX terms
  forbid offering output "as isolated audio files or samples". The music terms forbid any
  "collection of Output … made available to third parties".
- **ZeroGPU is free for everyone**, with a daily quota: 5 min on a free account, 40 min on PRO
  ($9 a month). The quota resets 24 h after your first use, and calls default to 60 s each. ZeroGPU
  suits images and short video best. For TTS, batch many lines per call, or run the model on the
  Mac with no quota at all.
- **Recommendation:** use open, permissively licensed models, so files can be redistributed like
  the code.
  - **Voices:** Qwen3-TTS VoiceDesign (Apache-2.0, German). Piper thorsten-medium (CC0 lineage) is
    the cheap fallback.
  - **SFX:** MOSS-SoundEffect v2.0 (Apache-2.0).
  - **Music:** ACE-Step 1.5 (MIT).
  - **Images:** Z-Image-Turbo or FLUX.2 klein 4B (both Apache-2.0).
  - **Video:** Wan 2.2 5B (Apache-2.0).
  - **If the open German voices don't sound good enough:** voice the key lines with ElevenLabs
    Voice Design on one or two paid months (§5).

---

## 1. ElevenLabs, current terms

| Item | Free | Starter | Creator | Source |
|---|---|---|---|---|
| Price | $0 | $6 a month ($1 the first month) | $22 a month ($11 the first month) | [pricing][el-pricing] |
| Credits (creative platform) | 10k a month | 30k a month | 121k a month | [pricing][el-pricing] |
| API usage included (TTS) | 10,000 chars on v4/v3/Multilingual v2, or 20,000 on Flash | ≈ 75,000 v4 chars (= $6 at $0.08 per 1k) | ≈ 275,000 v4 chars | [API pricing][el-api] |
| API list price | – | $0.08 per 1k chars (v4, v3, Multilingual v2); $0.04 (Flash, v4 Turbo). "API usage is billed in US dollars, not credits." | same | [API pricing][el-api] |
| Credit cost | Website: 1 credit per character on every model (v4, Multilingual v2, Flash), "excluding credit multipliers". API: billed per character in US dollars (row above). | same | same | [help: models][el-models-help], [API pricing][el-api] |
| Period | **Monthly.** "Your credit allowance resets at the start of each billing cycle." No daily allowance. | monthly | monthly | [pricing][el-pricing] |
| Rollover | **None.** "Rollover does not apply to the Free plan." | Up to 2 months of credits, while subscribed | same | [pricing][el-pricing], [billing][el-billing] |
| API access | Yes for TTS. **No Voice Library voices**: "The voice library is not available via the API to free tier users." | yes | yes | [quickstart][el-quick] |
| Custom voices | 3 slots (Voice Design only, no cloning) | 10 slots, Instant Voice Cloning | 30 slots, Professional Voice Cloning | [billing][el-billing], [pricing][el-pricing] |
| Commercial use | **No.** "you may only use the Services for non-commercial purposes" (ToS §1(c)(i)) | Yes, for content made during the paid subscription (Beta services excluded) | yes | [ToS][el-tos], [publish FAQ][el-publish] |
| Attribution | **Required.** Put "elevenlabs.io" or "11.ai" in the title; for music, "Eleven Music". | not required | not required | [publish FAQ][el-publish] |
| After upgrading | Free-tier files **stay non-commercial**: "Content created outside of a paid subscription (before or after) cannot be used commercially." | – | – | [publish FAQ][el-publish] |
| Output ownership | "you retain all rights in and to your Output" (ToS §4(c)(ii)). ElevenLabs also gets a perpetual, sublicensable licence to your Content (§4(d)), and you can opt out of training (§4(i)). | same | same | [ToS][el-tos] (updated 2026-10-09) |
| Concurrency (Multilingual/v3 vs Flash) | 2 / 4 | 3 / 6 | 5 / 10 | [models][el-models] |
| Chars per request | v3: 5,000; v4 and Multilingual v2: 10,000; Flash v2.5: 40,000. The game's longest line is 466. | same | same | [models][el-models] |
| Sound effects | Credits per generation; non-commercial on Free | commercial | commercial | [pricing][el-pricing], [SFX terms][el-sfx] |
| Music | 11 min of generation a month, **no downloads, no API**, attribution required | API, 30 min of downloads, no streaming distribution | streaming allowed | [music terms][el-music] |

**German.** Eleven v4, v4 Turbo, v3, Multilingual v2 and Flash v2.5 all list German ([models][el-models]).
Voice Design voices "work with Eleven v4 … and with earlier models including Eleven v3". The page
calls Voice Design "still experimental" and doesn't mention German as a prompt language. Accent
prompts are supported, so a test is needed ([voice design][el-vd]).

**Voice Library licence.** Free and paid users can both use shared voices on the website, but the
API gives free users no access to them. A voice's owner can withdraw it after a notice period (for
example 30 days). Clips made before then stay usable ([VLA][el-vla], 2026-03-06). Library voices
are clones of real people, made with their consent. That breaks the "never clone a real person"
spirit and risks losing the voice halfway through the game, so use **Voice Design** voices only.

**Restrictions on public open-source redistribution**

| Output | Can it go in a public MIT repo or on a public site? |
|---|---|
| TTS, Free plan | **No under MIT.** It is non-commercial and needs attribution. MIT grants commercial use to everyone, so the files would need their own non-commercial notice, and forks could not take them over. |
| TTS, paid plan | **Yes, most likely.** You own the output and have a commercial licence. You can license the files yourself (CC0 or CC-BY-4.0). I found no clause against isolated files for TTS. Re-check before publishing. |
| Sound effects, any plan | **No.** ElevenCreative Exhibit 4 §2 allows use "only in respect of Output combined with other material" and forbids making it available "as isolated audio files or samples" or "as part of any sound, sample, effects, or music library or other collection of sounds" ([SFX terms][el-sfx]). A public `public/assets/sfx/*.ogg` folder is exactly that. |
| Music, any self-serve plan | **No.** You "must not … use Output to compile, create, or contribute to a Music Library", which the terms define as "any collection of Output, in whole or in part, made available to third parties" (§4.2, §4.8(f)). Indie games are allowed, but a repo of tracks is a collection ([music terms][el-music]). |

**Policy limits** ([use policy][el-aup], 2026-10-09): no cloning or impersonating a living person
without consent. Deceased people are covered only where the use is "reasonably likely to cause
harm". Disclose AI where not doing so would mislead. Don't "remove, alter, or conceal ElevenLabs
watermarks, metadata or other provenance signals" to disguise AI content.

## 2. Hugging Face ZeroGPU, current terms

| Item | Fact | Source |
|---|---|---|
| Hardware | NVIDIA RTX Pro 6000 Blackwell. `large` (default) is half a card, 48 GB, 1× quota. `xlarge` is a full card, 96 GB, 2× quota. | [ZeroGPU docs][hf-zg] |
| Who can use it | "ZeroGPU Spaces are available to use for free to all users." | [ZeroGPU docs][hf-zg] |
| Daily quota | Unauthenticated **2 min**, free account **5 min**, PRO **40 min** (extensible), Team 40, Enterprise 60 | [ZeroGPU docs][hf-zg] |
| Reset | "Included daily quota resets exactly **24 hours after your first GPU usage**", so it rolls instead of resetting at midnight | [ZeroGPU docs][hf-zg] |
| Beyond quota | PRO, Team and Enterprise only: pre-paid credits at $1 per 10 GPU-min | [ZeroGPU docs][hf-zg] |
| PRO | $9 a month: 8× ZeroGPU quota, highest queue priority, $2 of inference credits | [HF pricing][hf-pricing] |
| Hosting your own | A free account (verified email, older than 30 days) can host 2 ZeroGPU Spaces; PRO 10; organisations 50. Gradio SDK only, PyTorch 2.8+, no `torch.compile` (ahead-of-time compilation works). | [ZeroGPU docs][hf-zg] |
| Duration per call | Default **60 s** per `@spaces.GPU` call. A longer `duration=` can be set, as can a function that returns one. The cap is **undocumented**: a 2024 reply from a ZeroGPU team member says it is "subject to change but will always be around a few couple minutes". Forum users report requests of 240 to 300 s rejected. | [ZeroGPU docs][hf-zg], [forum][hf-maxdur] |
| How quota is counted | The docs speak of "effective" duration. The community reports that the remaining quota is checked against the *requested* duration before a call starts, and an unverified April 2026 report mentions a per-day run limit for free users. | [ZeroGPU docs][hf-zg], [forum][hf-reserved] |
| Programmatic calls | `from gradio_client import Client`, then `Client("owner/space", token=HF_TOKEN).predict(..., api_name="/generate")` (older clients call it `hf_token=`), or `.submit()` for a job; wrap files in `handle_file()`. Without a token you get the IP-based 2-min quota. Some forum threads report "falling back to IP-based quotas" until Gradio is upgraded. Too many requests can be rate-limited. | [Gradio client guide][gr-client], [forum][hf-ip] |

**What this means.** Run your own Space with **one batch endpoint**: many lines or prompts per call,
and a dynamic `duration`. Per-line calls of 60 s waste the quota (§4).

## 3. Open-licence models

Licences come from each model's Hugging Face card (the `license` tag, plus the licence text for
custom licences), read on 2026-11-20. The picks were checked again against the Hub API's licence
tags. "ZeroGPU" means a Space on ZeroGPU hardware was running that day.

- **OK:** permissive (Apache-2.0, MIT, CC0, CC-BY-4.0, OpenRAIL-M/++ use rules).
- **CAUTION:** a custom licence with a revenue cap, attribution, AUP or a disclosure duty.
- **NO:** non-commercial weights, share-alike, or the EU excluded.

Most licences leave the outputs to the user, so share-alike in the weights doesn't reach our files.
Non-commercial weights do: their outputs can't be put under MIT.

**German TTS**

| Model | Card | Licence | Class | Notes |
|---|---|---|---|---|
| **Qwen3-TTS** 0.6B and 1.7B: Base, CustomVoice, **VoiceDesign** | [card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base) | Apache-2.0 | **OK** | German is among its 10 languages. Voices from a text description (1.7B-VoiceDesign); 3 s cloning (Base). Official Space `Qwen/Qwen3-TTS`; MLX ports for the Mac. No watermark mentioned. |
| Piper `de_DE-thorsten-medium` | [card](https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD) | MIT repo; data CC0; base model "rdh" CC0 | **OK** | The cleanest lineage. A voice donated under CC0 by a real speaker. Runs on CPU faster than real time. The tooling moved to GPL-3.0 (`OHF-Voice/piper1-gpl`); that covers the tool only, not the WAVs. |
| Piper kerstin-medium, mls-medium, eva_k, ramona | [repo](https://huggingface.co/rhasspy/piper-voices) | data CC0, CC-BY-4.0 or M-AILABS | OK | mls needs attribution |
| Piper thorsten-high/-low, kerstin-low, karlsson-low, thorsten_emotional; **pavoque** | same | base voices lessac (research only) or Ryan (CC-BY-NC-SA); pavoque data is NC-SA | CAUTION; **NO** for pavoque | NC or research-only base voices |
| Thorsten-Voice Kokoro (2026-07) | [card](https://huggingface.co/Thorsten-Voice/Kokoro) | Apache-2.0, Thorsten data CC0 | OK | One German voice, CPU real time |
| Chatterbox Multilingual V3 | [card](https://huggingface.co/ResembleAI/chatterbox) | MIT | OK | German; cloning. **Perth watermark on every output** (harmless; never strip it). ZeroGPU Space and MLX port. |
| VoxCPM2 (2B) | [card](https://huggingface.co/openbmb/VoxCPM2) | Apache-2.0 | OK | German; voice design and cloning at 48 kHz; MLX ports |
| KugelAudio-0-open (7B) | [card](https://huggingface.co/kugelaudio/kugelaudio-0-open) | MIT | OK | **German-first**; no cloning; AudioSeal watermark; about 19 GB VRAM, so ZeroGPU only |
| ZONOS3-Mini (2026-11-09) | [card](https://huggingface.co/Zyphra/ZONOS3-Mini) | Apache-2.0 | OK, but new | German; voice design; MLX and in-browser WebGPU. Only 11 days old. |
| Parler-TTS Mini Multilingual, CosyVoice 3, MOSS-TTS 1.5, OuteTTS-1.0-0.6B | [Parler](https://huggingface.co/parler-tts/parler-tts-mini-multilingual-v1.1) · [CosyVoice3](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512) | Apache-2.0 | OK | Alternatives |
| Orpheus German, Higgs Audio v2, IndexTTS2, Supertonic-3 | [Orpheus](https://huggingface.co/canopylabs/3b-de-ft-research_release) · [Higgs v2](https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base) | Llama 3.2 lineage; Boson licence (Llama 3 based); bilibili licence; OpenRAIL-M | CAUTION | IndexTTS has no German. Supertonic requires disclosing machine-generated content. |
| F5-TTS (and its German fine-tunes), XTTS-v2, Fish Speech / OpenAudio / S2, Higgs v3, OmniVoice | [F5](https://huggingface.co/SWivid/F5-TTS) · [XTTS](https://huggingface.co/coqui/XTTS-v2) · [OpenAudio](https://huggingface.co/fishaudio/openaudio-s1-mini) | CC-BY-NC, CPML, CC-BY-NC-SA, research-only | **NO** | Non-commercial |
| VibeVoice (Microsoft) | [card](https://huggingface.co/microsoft/VibeVoice-1.5B) | MIT, but "research … only" | NO in practice | Every file contains an **audible** "generated by AI" line |
| Kokoro-82M (official), Kyutai TTS, MeloTTS, Dia | [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) | Apache-2.0 / CC-BY / MIT | OK licence | **No German** |

**Cloning rule.** Several of these models clone from 3 to 30 s of reference audio. Use that only to
pin a **synthetic** voice: design it once, keep the reference clip, then clone from it so every
line sounds alike. Never use a recording of a real person.

**SFX, ambience, music, images, video**

| Use | Model | Card | Licence | Class | Notes |
|---|---|---|---|---|---|
| SFX | **MOSS-SoundEffect v2.0** (1.3B) | [card](https://huggingface.co/OpenMOSS-Team/MOSS-SoundEffect-v2.0) | Apache-2.0 | **OK** | 48 kHz, up to 30 s, English prompts; ZeroGPU Space |
| SFX | EzAudio | [card](https://huggingface.co/OpenSound/EzAudio) | MIT | OK | ZeroGPU Space; training data not stated |
| SFX | Stable Audio 3 small-sfx, Stable Audio Open 1.0 / Small | [card](https://huggingface.co/stabilityai/stable-audio-3-small-sfx) · [SAO 1.0](https://huggingface.co/stabilityai/stable-audio-open-1.0) | Stability AI Community License (+ Gemma ToU for SA3) | CAUTION | Commercial use free under **$1M revenue** with registration, **"Powered by Stability AI"**, outputs yours. Runs in seconds on an M4. |
| SFX | AudioLDM 2, Tango 2, TangoFlux, MMAudio, AudioGen, ThinkSound, AudioX, HunyuanVideo-Foley | [AudioLDM2](https://huggingface.co/cvssp/audioldm2) · [MMAudio](https://huggingface.co/hkchengrex/MMAudio) | NC, NC-SA, or EU excluded | **NO** | |
| Music | **ACE-Step 1.5** | [card](https://huggingface.co/ACE-Step/Ace-Step1.5) | MIT | **OK** | The card allows commercial use of output and claims licensed or royalty-free training data. Official ZeroGPU Space; **official Mac MLX** support. |
| Music | DiffRhythm 2, YuE v1, HeartMuLa, Magenta RealTime | [DiffRhythm2](https://huggingface.co/ASLP-lab/DiffRhythm2) · [Magenta RT](https://huggingface.co/google/magenta-realtime) | Apache-2.0 / CC-BY-4.0 | OK | |
| Music | MusicGen, YuE2-3B, SongBloom (unverified) | [MusicGen](https://huggingface.co/facebook/musicgen-large) | CC-BY-NC | **NO** | |
| Images | **Z-Image-Turbo** (6B, 8 steps) | [card](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) | Apache-2.0 | **OK** | Official ZeroGPU Space; mflux/MLX on the Mac |
| Images | **FLUX.2 [klein] 4B** | [card](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B) | Apache-2.0 | **OK** | Official Space; mflux. (The **9B** klein is non-commercial.) |
| Images | FLUX.1-schnell, Qwen-Image-2512, SDXL, Chroma1-HD, Sana | [schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) · [Qwen-Image-2512](https://huggingface.co/Qwen/Qwen-Image-2512) | Apache-2.0 / OpenRAIL++ | OK | |
| Images | SD 3.5, HiDream-I1 (bundles Llama 3.1) | [SD3.5](https://huggingface.co/stabilityai/stable-diffusion-3.5-large) | Stability Community / Llama | CAUTION | |
| Images | FLUX.1-dev, FLUX.2-dev, FLUX.2 klein 9B, **Qwen-Image-2.1** (now "Qwen Research", NC), HunyuanImage, MiniMax-H3-Image | [Qwen-Image-2.1](https://huggingface.co/Qwen/Qwen-Image-2.1) · [HunyuanImage 3](https://huggingface.co/tencent/HunyuanImage-3.0) | NC, or EU excluded | **NO** | |
| Video | **Wan 2.2 TI2V-5B** (also 2.1, A14B) | [card](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B) | Apache-2.0 | **OK** | "We claim no rights over … generated contents". ZeroGPU Spaces for A14B. Slow on the Mac. |
| Video | CogVideoX-2b, Mochi 1, LongCat-Video, Kandinsky 5 Lite | [CogVideoX-2b](https://huggingface.co/THUDM/CogVideoX-2b) | Apache-2.0 / MIT | OK | |
| Video | LTX-Video 0.9.6+, LTX-2.x | [LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3) | LTX community licences | CAUTION | A licence is needed from **$10M** revenue; disclosure required; don't remove watermarks |
| Video | HunyuanVideo / 1.5, SkyReels-V1, MiniMax-H3 | [HunyuanVideo 1.5](https://huggingface.co/tencent/HunyuanVideo-1.5) | Tencent / MiniMax community licences | **NO** | They **exclude the EU** (and the UK and Korea), including displaying outputs there |

**Watch out.** Qwen-Image-2.1 and YuE2 moved to non-commercial licences, while the older versions
stay Apache. ThinkSound is tagged Apache on its card, but its README forbids commercial use. Read
the licence text, not only the tag.

## 4. How much text the game has

Counted from 463 pack dialogue lines, 72 inline `say` lines in story files (the 109 `line:`
references point to pack lines and are not counted twice) and 212 quest lines (`offer`,
`turnin_lines`, `history`, `progress`). Not counted: 14 sound captions (`geraeusch`) and the story
file's epilogue fallback.

**Spoken lines: lines / characters per group and chapter**

| Group | Prologue | K1 | K2 | K3 | K4 | Endings | Barks (all chapters) | **Total** |
|---|---|---|---|---|---|---|---|---|
| Laub | 64 / 7,220 | 55 / 6,488 | 65 / 7,185 | 66 / 9,141 | 74 / 10,169 | 13 / 1,096 | 44 / 2,991 | **381 / 44,290** |
| Marlene (radio) | 32 / 4,297 | 7 / 717 | 4 / 542 | 3 / 467 | 4 / 522 | 4 / 517 | 15 / 1,235 | **69 / 8,297** |
| NPC ghosts (28 speakers) | 2 / 70 | 84 / 9,669 | 37 / 2,902 | 64 / 6,993 | 38 / 3,905 | 1 / 33 | 9 / 492 | **235 / 24,064** |
| Narrator (epilogue) | – | – | – | – | – | 44 / 5,417 | – | **44 / 5,417** |
| Other (radio colleague, laptop, voice in the fog) | 2 / 192 | – | – | – | 2 / 33 | – | – | **4 / 225** |
| **All** | 100 / 11,779 | 146 / 16,874 | 106 / 10,629 | 133 / 16,601 | 118 / 14,629 | 62 / 7,063 | 68 / 4,718 | **733 / 82,293** |

- **Totals.** Without the 15 exact duplicates there are **718 clips and 80,639 characters**:
  13,487 words, or about **90 to 100 minutes of speech** at 135 to 150 words a minute. The median
  line has 105 characters, the longest 466.
- **Top speakers by characters:** Laub 44.3k, Marlene 8.3k, Soll 6.6k, narrator 5.4k, Jost 4.8k,
  Hanne 4.6k, Mannlich 2.5k, Diener 1.6k, Peter 1.2k. The other 25 speakers have at most 0.6k each.
- **By kind:** scripted beats 274, NPC talk 74, quest history 72, quest offer 66, barks 64,
  echoes 59, quest turn-in 51, epilogue 46, quest progress 23.
- **9 lines carry runtime placeholders** and can't be pre-recorded as written: `{Name}` in 8, and
  `{jahre:1793}` in `laub.end.museum_1`. Write a voiced variant without the name, or let these
  lines murmur.
- **UI and codex text, not voiced: 961 items, 76.4k characters.** That is codex facts 18.9k,
  Chronik clues 16.8k, quest titles and summaries 7.8k, story objectives 7.5k, quest objectives
  6.3k, cases 3.5k, toasts, prompts and captions 3.2k, case hints 3.0k (written in Laub's voice; a
  later option) and noun labels 1.7k.

**Voicing tiers and what each costs** (cumulative; "×1.5" adds 50 % for retakes)

| Tier | Content | Clips | Chars | Speech | ElevenLabs Free (10k a month) | ElevenLabs Starter API (≈75k a month), ×1.5 | Pay-as-you-go at $0.08 per 1k, ×1.5 |
|---|---|---|---|---|---|---|---|
| 1 | Prologue (all), all barks, all Marlene | 165 | 15.7k | ≈ 19 min | 1.6 months (2.4 with retakes) | 0.3 months | $1.90 |
| 2 | + Laub K1–K4 and endings, narrator epilogue | 274 | 31.0k | ≈ 37 min | cumulative 4.7 (7.0) months | 0.9 months | $5.60 |
| 3 | + NPC ghost talks, echoes, quest-giver lines | 207 | 20.7k | ≈ 25 min | cumulative 6.7 (10.1) | 1.35 | $8.10 |
| 4 | + quest history monologues (long lore) | 72 | 13.3k | ≈ 15 min | cumulative **8.1 (12.1) months** | **1.6 months** | **$9.70** |

**ZeroGPU days with an open TTS model.** Assumptions: a model of 0.5 to 2 B parameters on `large`
at a real-time factor of 0.1 to 0.3, and 95 min of speech ×1.5 for retakes, so about 15 to 45
effective GPU-minutes.

| Batching | Free account (5 min a day) | PRO (40 min a day) |
|---|---|---|
| Batched: about 20 lines per call, about 50 calls, at most 60 s reserved each | **about 6 to 10 days** | **1 to 2 days** |
| One line per call with 60 s reserved (worst case) | about 215 days | about 27 days |
| Locally on the M-series Mac: Qwen3-TTS MLX port; Piper or Thorsten-Kokoro on CPU | no quota. About one night for Qwen3-TTS (unmeasured); minutes for Piper. | – |

**Other media on ZeroGPU** (estimates, unmeasured): an Apache image model (Z-Image-Turbo, FLUX.2
klein 4B) takes a few seconds per image. Batched, that is about 60 to 150 images a day on a free
account and several hundred on PRO. A Wan 2.2 5B clip of 5 s takes minutes, longer than the 60 s
default, so expect 1 to 3 clips a day on a free account and 15 to 30 on PRO.

## 5. Recommendation

**Which tool for what**

| Need | Use | Not |
|---|---|---|
| Voices (German) | **First choice:** **Qwen3-TTS** (Apache-2.0), on the Mac through MLX or in your own ZeroGPU Space. Design each speaker once with 1.7B-VoiceDesign from a German description, then pin it by cloning the synthetic reference clip with Base. Files can be redistributed like the code, cost nothing and can be regenerated. Compare VoxCPM2, Chatterbox (watermarked) and KugelAudio on 10 test lines. Fallback for the narrator: Piper thorsten-medium. **If the quality falls short:** ElevenLabs v3/v4 with **Voice Design** voices on **one or two paid Starter months** ($6 to $12; one Creator month at $22 gives room for retakes). | ElevenLabs Free (non-commercial, attribution, can't be MIT, 3 voice slots); Voice Library voices; F5, XTTS and Fish (NC weights); any cloning of a real voice |
| SFX and ambience | Keep the procedural synth (`src/audio/synth.ts`): it is small and part of the look. For one-off sounds use CC0 packs (Kenney audio) or **MOSS-SoundEffect v2.0** (Apache-2.0) or EzAudio (MIT). | ElevenLabs SFX (isolated-file clause); AudioLDM, Tango, MMAudio (NC); Stable Audio only with the owner's OK ($1M cap, "Powered by Stability AI") |
| Music | The procedural score, or **ACE-Step 1.5** (MIT, official Mac MLX), stored as small loops | Eleven Music (music-library clause; Free has no download); MusicGen (NC) |
| Images: codex, loading screens, storyboard | **Z-Image-Turbo** or **FLUX.2 klein 4B** (Apache-2.0) in a ZeroGPU Space or with mflux on the Mac, styled to `docs/ART-DIRECTION.md`. Label each image "KI-Illustration, keine historische Quelle". | FLUX.1-dev, FLUX.2-dev, klein 9B, Qwen-Image-2.1 (NC); Hunyuan (EU excluded) |
| Trailer | **Real gameplay capture** first (honest and on brand). **Wan 2.2** (Apache-2.0) clips only for short stylised interstitials, such as the 1793 fire or the fog, and marked as such | AI footage presented as gameplay; HunyuanVideo (EU excluded) |

**Voices: order and cast**

| Order | Speaker(s) | Why |
|---|---|---|
| 1 | **Laub** (half of all text, 44.3k) | The companion, heard everywhere. Voice the prologue and barks first. |
| 2 | **Marlene** (8.3k) | Radio voice. The existing radio band-pass (`voice.ts` `radio`) hides TTS artefacts well. |
| 3 | **Narrator** (epilogue, 5.4k) | Calm reader for the ending pages. Heard once, high value. |
| 4 | **Soll, Jost, Hanne** (16k) | The recurring ghosts. Apply the existing `hall` effect live. |
| 5 | Mannlich, Peter, Diener, Gärtner, Wache, Pikeur | Few lines. Mannlich is historical: synthetic voice, and the "Erinnerung (Fiktion)" label stays |
| – | About 20 extras with one or two lines each (the Herzog among them); `geraeusch` | Keep the murmur |

- **Hybrid.** Voice Tier 1, then Tier 2. Everything else keeps the murmur until it is voiced. A
  voiced line plays its clip instead of the blips. Subtitles always stay.
- **Consistent voices.** One fixed voice per speaker in a cast file: provider, voice ID, model,
  settings, seed, and the text prompt that designed the voice. Record the clips dry and add radio
  or hall live in Web Audio, so the same voice works in every context.
- **German only.** Write the voice-design prompts in German ("tiefer Bariton, ruhig, leicht
  pedantisch, Mitte 50"). Test 10 sample lines per voice before a batch run.
- **Never clone a real person's voice.** That covers the owner, testers, actors and Library voices.
  Only designed or synthetic speaker voices, or a model's built-in voices whose dataset licence is
  stated. Piper and Kokoro "thorsten" is a real speaker who donated his voice under CC0. That is
  allowed, but it is the owner's call.

**Asset rule change (the owner must approve).** Generated files are not CC0 by origin. Proposed
addition to `docs/NEXT-SESSION.md` §5 and `docs/ART-DIRECTION.md` §8:

> **AI-generated assets** (voice, images, music, SFX, video) are allowed when (1) the model's or
> service's licence permits commercial use and public redistribution of outputs, with no
> non-commercial, share-alike, territory or "no isolated files" restriction; (2) the voice is
> designed or synthetic, never a clone of a real person; (3) each file is credited in
> `public/assets/LICENSES.json` and on "Lizenzen & Quellen" with the tool, model and version,
> model licence, our output licence (CC0-1.0 by default), the generation date, and the prompt or
> source line id; (4) players see that it is AI-generated ("KI-Stimme", "KI-Illustration").
> ElevenLabs output only from a paid plan, and only TTS.

## 6. Pipeline sketch (not built)

```
content/voice/cast.json        speaker → { provider, voiceId, model, settings, seed, designPrompt, fx: radio|hall|none }
scripts/voice/select.mjs       next lines by tier, skips ids whose manifest textHash matches
scripts/voice/gen-*.mjs        adapters: elevenlabs (REST) | space (gradio_client batch) | local (MLX/piper)
scripts/voice/post.mjs         ffmpeg: trim silence → loudnorm → Opus (+ AAC) → manifest + credits
public/assets/voice/<chapter>/<lineId>.<hash8>.webm | .m4a
public/assets/voice/manifest.json   { lineId: { file, ms, speaker, textHash, tool, model, licence, date } }
```

| Step | Detail |
|---|---|
| Pick | Read the packs, story and quests the same way the count script does, order by tier (§4), skip lines with `{Name}` unless a voiced variant exists, and stop at the budget. |
| Budget | ElevenLabs: `GET /v1/user/subscription` gives `character_count`, `character_limit` and `next_character_count_reset_unix` ([API][el-sub]). Spend what is left before the reset, because Free has no rollover. ZeroGPU: about 4.5 of the 5 min (or 38 of 40) a day, in one batch call per minute of quota. |
| Generate | Fixed voice ID, model and settings per speaker from `cast.json`. Use a seed where the API offers one. Stay within the concurrency limit (2 on Free). Retry on 429. |
| Post-process | Trim silence, then two-pass `loudnorm` to **−18 LUFS integrated, −1.5 dBTP**, mono 24 kHz. Encode **Opus 24 kbps** (`libopus`, `-application voip`) in WebM or Ogg, plus **AAC about 40 kbps** `.m4a`, because caniuse marks macOS Safari Opus as "partial" ([caniuse][ciu-opus]). |
| Manifest and credits | One manifest entry per line: id, file, duration, `textHash` (a text change regenerates the line), tool, model, licence, date. Append to the `LICENSES.json` `generated` section. Never edit clips by hand. |
| Schedule | Free quota is monthly, so a **daily** run makes sense only for ZeroGPU, or to spread ElevenLabs work evenly. In Claude Code: `/loop 1d pnpm voice:next`, or a local `launchd` job on the Mac. It reports what it made and opens no PR. |
| Keys | `ELEVENLABS_API_KEY` and `HF_TOKEN` go in a local `.env.local`. **Add `.env*` to `.gitignore`**, which today has no `.env` entry. Never use the `VITE_` prefix, or Vite puts the key into the bundle. Never in CI. CI only checks the manifest: every file exists, its hash matches the text, and it is credited. |
| Playback | A `VoiceClips` service loads `manifest.json` (a few kB) at boot, then fetches and decodes a chapter's clips on first use and prefetches the next 3 queued lines. In `presenter.ts`, a line with a clip, the voice setting on and a matching `textHash` plays the clip on the existing `voice` bus. Marlene's clips go through the radio chain, echoes through the hall. Blips are muted; the line holds for max(reading time, clip + 0.3 s); Enter stops the clip. Game pause stops the clip and remembers the offset. A missing clip, a decode error or the setting off falls back to the **murmur**. |
| Settings | The voice volume slider already exists (`settings.volume.voice`). Add "Sprachausgabe: Stimmen / Gemurmel / Aus". Subtitles stay on in every mode. |
| Size budget | All 95 min of speech in Opus at 24 kbps is about **17 MB**, and the AAC copies add about 28 MB to `dist`. Each player downloads only one format, chapter by chapter, 2 to 4 MB per chapter. Tier 1 alone is about 3.4 MB. Today `public/` is 41 MB, and GitHub Pages allows a published site of up to 1 GB ([GH Pages limits][gh-pages]). **Budget: at most 50 MB of voice in `dist`, at most 5 MB per chapter.** |

The production policy adopted after this proposal warns above 60 MB of encoded clips and caps the
shipped `public/voice/` directory at 80 MB (decimal). On 2026-11-26 it totalled **12.97 MB**
(12,968,959 bytes), including both audio formats and the manifest. `tests/voice-assets.test.ts`
checks the shipped total and the voice credits.

**Decisions for the owner**

1. Approve the asset rule above, or keep CC0-only. CC0-only allows only permissive models whose output we dedicate to CC0.
2. Choose the voice route: an open model (free, matches MIT), or one or two paid ElevenLabs months ($6 to $22). Free ElevenLabs is not recommended.
3. Choose the output licence for generated files: CC0-1.0 (recommended) or CC-BY-4.0. State it in `LICENSES.json` and the README, separate from MIT.
4. Approve the voice cast: a German design prompt per speaker, synthetic voices for the historical figures, and how the "KI-Stimme" credit reads.
5. Choose the Tier 1 scope, and whether the 9 `{Name}` lines get voiced variants.
6. Approve the size budget and the Opus + AAC fallback.

---

[el-pricing]: https://elevenlabs.io/pricing
[el-api]: https://elevenlabs.io/pricing/api
[el-models]: https://elevenlabs.io/docs/overview/models
[el-models-help]: https://elevenlabs.io/docs/help-center/technical/what-models-do-you-offer-and-what-is-the-difference-between-them
[el-billing]: https://elevenlabs.io/docs/overview/administration/billing
[el-publish]: https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform
[el-tos]: https://elevenlabs.io/terms-of-use
[el-quick]: https://elevenlabs.io/docs/eleven-creative/quickstart
[el-vd]: https://elevenlabs.io/docs/eleven-creative/voices/voice-design
[el-vla]: https://elevenlabs.io/vla
[el-sfx]: https://elevenlabs.io/sound-effects-terms
[el-music]: https://elevenlabs.io/eleven-music-model-specific-terms
[el-aup]: https://elevenlabs.io/use-policy
[el-sub]: https://elevenlabs.io/docs/api-reference/user/subscription/get
[hf-zg]: https://huggingface.co/docs/hub/spaces-zerogpu
[hf-pricing]: https://huggingface.co/pricing
[hf-maxdur]: https://huggingface.co/spaces/zero-gpu-explorers/README/discussions/34
[hf-reserved]: https://discuss.huggingface.co/t/it-seems-use-60-sec-gpu-quota-instead-of-real-time-usage/175130
[hf-ip]: https://discuss.huggingface.co/t/error-using-zerogpu-falling-back-to-ip-based-quotas-even-as-a-pro-user/175089
[gr-client]: https://www.gradio.app/guides/getting-started-with-the-python-client
[ciu-opus]: https://caniuse.com/opus
[gh-pages]: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
