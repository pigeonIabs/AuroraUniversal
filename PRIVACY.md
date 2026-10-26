# Privacy

Updated October 25, 2026.

Aurora Universal changes the appearance of supported AI websites. Its appearance, privacy, and workflow features run in your browser. Aurora has no analytics service and does not send conversations to an Aurora server.

## Stored in your browser

Preferences use browser storage and may synchronize through Firefox Sync when enabled. Uploaded background files stay in local storage. Native model labels are cached locally for model preferences.

Message queues and original text used for masking stay in page memory until cleanup. Masking and history blur provide visual privacy. They do not change what the underlying website receives or stores.

ChatGPT ad hiding uses page markers and promotion text to hide sponsored placements. It does not block the website's ad delivery requests.

## Media requests

Custom background URLs load directly from the selected provider. The default ChatGPT wallpaper loads from OpenAI's static asset service. Other background presets may also load remote media. Those providers receive normal browser requests. Included backgrounds and reading fonts load from the extension package.

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Preferences and local background data |
| `unlimitedStorage` | Uploaded images and videos within the 15 MB file limit |
| Supported AI website hosts | Appearance and features on those websites |
| Gemini's Opal gallery hosts | Appearance inside the embedded Labs gallery |

Supported hosts are ChatGPT, Claude, Gemini, Grok, Qwen, Google AI Studio, DeepSeek, and Hugging Face. Hugging Face authentication, API, and account settings routes keep their native interface. Embedded Spaces use separate hosts.

The Opal gallery bridge is limited to Gemini's embedded lite gallery. It passes appearance values, not conversation content.

## Contact

Each AI website has its own privacy practices. Aurora privacy questions can be filed in the [project repository](https://github.com/pigeonIabs/AuroraUniversal).
