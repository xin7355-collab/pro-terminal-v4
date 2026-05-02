// api/ai-news.js
export default async function handler(req, res) {
    // 1. 設定 CORS 標頭 (允許你的前端跨域呼叫)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 處理預檢請求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 限定只接受 POST 請求
    if (req.method !== 'POST') {
        return res.status(405).json({ score: 0, reason: "只允許 POST 請求" });
    }

    try {
        // 2. 解析前端傳來的 Payload (JSON 格式)
        const { symbol, stockName, industry, newsList } = req.body;

        if (!newsList || newsList.length === 0) {
            return res.status(200).json({ score: 0, reason: "近期無重大相關新聞，維持技術面判定。" });
        }

        // 3. 安全讀取環境變數 (🚨 絕對不要寫死在程式碼裡)
        // 假設使用 Google Gemini API，請在 Vercel 後台設定 GEMINI_API_KEY
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('缺少 AI API Key 環境變數');
            return res.status(200).json({ score: 0, reason: "後端未配置 AI 金鑰，新聞模組暫時休眠。" });
        }

        // 4. 精心設計的 System Prompt (要求極簡 JSON 輸出，加速生成)
        const prompt = `
你是一位台股資深量化分析師。請分析以下關於「${stockName}(${symbol}) - ${industry}」的近期新聞標題。
請嚴格根據新聞的利多/利空程度給予評分，範圍從 -20(極度看空) 到 +20(極度看多)，如果無關緊要請給 0。
請提供 30 字以內的極簡理由。

新聞列表：
${newsList.join('\n')}

請「絕對只」輸出以下 JSON 格式，不要包含任何 Markdown 標記 (如 \`\`\`json) 或額外文字：
{"score": 評分數字, "reason": "你的簡短理由"}
        `;

        // 5. 【防呆機制】建立 8.5 秒強制中斷器，防止 Vercel 10 秒 Timeout 報錯
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8500);

        // 呼叫 AI 模型 (此處以 Gemini 1.5 Flash REST API 為例)
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2 } // 降低溫度，讓輸出更穩定與明確
            }),
            signal: controller.signal // 綁定超時中斷器
        });

        clearTimeout(timeoutId); // 成功回覆則清除計時器

        if (!aiResponse.ok) {
            throw new Error(`AI API 回應異常: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const rawText = aiData.candidates[0].content.parts[0].text.trim();

        // 6. 解析 AI 回傳的 JSON
        let result;
        try {
            result = JSON.parse(rawText);
        } catch (parseError) {
            // 防呆：萬一 AI 犯蠢沒有輸出標準 JSON，做字串清理後重試
            const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            result = JSON.parse(cleanedText);
        }

        // 7. 將成功解析的分數與理由回傳給前端
        return res.status(200).json({
            score: typeof result.score === 'number' ? result.score : 0,
            reason: result.reason || "分析完成，未提供具體理由。"
        });

    } catch (error) {
        // 【極端情況處理】
        console.error('AI 新聞分析失敗:', error.name, error.message);
        
        let fallbackReason = "AI 分析伺服器忙碌中，回退為中立預設值。";
        if (error.name === 'AbortError') {
            fallbackReason = "AI 模型思考逾時，系統主動截斷以確保終端流暢度。";
        }

        return res.status(200).json({ 
            score: 0, 
            reason: fallbackReason
        });
    }
}