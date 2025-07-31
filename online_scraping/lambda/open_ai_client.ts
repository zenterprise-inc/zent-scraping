import OpenAI from "openai";

export class OpenAIClient {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({apiKey: ''});
    }

    async ask(
        imageBuffer: Buffer,
        question: string,
        mimeType: string = "image/png"
    ): Promise<string | null> {
        try {
            const base64Image = imageBuffer.toString("base64");

            const response = await this.client.chat.completions.create({
                model: "gpt-4.1",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${mimeType};base64,${base64Image}`,
                                    detail: "high",
                                },
                            },
                            {
                                type: "text",
                                text: question,
                            },
                        ],
                    },
                ],
            });

            //console.log(JSON.stringify(response, null, 2))
            return response.choices[0]?.message?.content;
        } catch (error) {
            console.error("Error asking question with image buffer:", error);
            return null;
        }
    }
}
