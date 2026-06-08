import { GoogleGenAI } from '@google/genai';

let _ai: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI {
  if (!_ai) {
    const useVertex =
      process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' ||
      !!process.env.GOOGLE_CLOUD_PROJECT;

    if (useVertex) {
      const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.VERTEX_PROJECT;
      const location =
        process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_LOCATION || 'us-central1';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config: any = { vertexai: true, project, location };

      if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        config.googleAuthOptions = {
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
        };
      }

      console.log(
        `[AI Client] Vertex AI (project=${project}, location=${location})`
      );
      _ai = new GoogleGenAI(config);
    } else {
      console.log('[AI Client] Google AI Studio (API Key)');
      _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    }
  }
  return _ai;
}
