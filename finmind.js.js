// api/finmind.js
export default async function handler(req, res) {
    // 1. 設定 CORS 標頭，允許你的前端網頁呼叫此 API (防呆與安全機制)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // 測試期先全開，實際上線可改為你的 Vercel 網址
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    // 處理瀏覽器的預檢請求 (Preflight)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // 2. 攔截前端傳來的參數 (dataset, data_id, start_date)
        const { dataset, data_id, start_date } = req.query;

        // 【防呆機制】檢查必填參數
        if (!dataset || !data_id) {
            return res.status(400).json({ msg: 'error', error: '缺少必要的參數: dataset 或 data_id' });
        }

        // 3. 從 Vercel 環境變數中讀取你的金鑰 (🚨 安全防護核心)
        // 請在 Vercel 後台設定環境變數 FINMIND_TOKEN
        const token = process.env.FINMIND_TOKEN || ''; 

        // 4. 組裝真實的 FinMind 請求網址
        let targetUrl = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${data_id}`;
        if (start_date) targetUrl += `&start_date=${start_date}`;
        if (token) targetUrl += `&token=${token}`;

        // 5. 伺服器端發起請求 (這裡有 Vercel 原生的超時保護)
        const response = await fetch(targetUrl);
        
        if (!response.ok) {
            throw new Error(`FinMind API 回應異常: 狀態碼 ${response.status}`);
        }

        const data = await response.json();
        
        // 6. 將獲取到的資料回傳給前端
        return res.status(200).json(data);

    } catch (error) {
        console.error('Serverless 請求發生錯誤:', error);
        // 【極端情況處理】如果 FinMind 當機或超時，回傳友善的錯誤格式
        return res.status(500).json({ 
            msg: 'error', 
            error: '後端代理請求失敗，請稍後再試。',
            details: error.message 
        });
    }
}