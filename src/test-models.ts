import { GoogleGenAI } from "@google/genai";

async function main() {
    const ai = new GoogleGenAI({});
    const res = await ai.models.list();
    console.log(JSON.stringify(res, null, 2));
}
main().catch(console.error);
