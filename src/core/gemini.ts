export async function processExpenseWithGemini(
  apiKey: string,
  categories: string[],
  textInput: string | null,
  imageBuffer: ArrayBuffer | null,
  imageMimeType: string | null,
  timezoneOffsetMs: number
): Promise<any> {
  // 對齊台灣時間的當前日期範圍
  const now = new Date(Date.now() + timezoneOffsetMs)
  const todayStr = now.toISOString().split('T')[0]

  const systemInstruction = `
你是一個專業的私人記帳助理。你的任務是從使用者的輸入中解析出「意圖」與「記帳資訊」，並**僅回傳嚴格的 JSON 格式**。
請勿包含任何 markdown 標籤（如 \`\`\`json ）。

使用者目前的可用分類 (Categories) 有：[${categories.join(', ')}]
當前的日期 (今天)：${todayStr}

你必須根據使用者的輸入，判斷他們的意圖 (action)，並回傳對應結構的 JSON：

1. 如果是「記錄花費」(例如：午餐 150、搭車 50)：
{
  "action": "insert",
  "data": {
    "date": "YYYY-MM-DD",
    "item": "品項名稱",
    "amount": 數字,
    "suggested_category": "合適的分類 (若無適合的，請自創一個精簡的新分類並填入)"
  }
}
* 若未明確指定日期，請預設使用今天日期 (${todayStr})。

2. 如果是「查詢花費 / 看報表」(例如：這個月吃飯花多少、昨天花了多少)：
{
  "action": "query",
  "filters": {
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "category_name": "指定的分類名稱 (若使用者未指定分類，此欄位留空或填入 null)"
  }
}
* 請將「上個月」、「這個月」、「今天」等口語精準轉換為起迄日期。例如若問「今天」，start_date 與 end_date 皆為今天。

4. 如果是要「刪除或管理分類」(例如：幫我把早餐分類刪掉)：
{
  "action": "delete_category",
  "category_name": "欲刪除的分類名稱"
}

5. 如果與記帳或查詢完全無關 (例如日常閒聊)：
{
  "action": "error",
  "message": "NOT_EXPENSE"
}

注意事項：
- 如果輸入包含照片，請優先透過視覺能力辨識收據或發票中的總額與品項，並將文字做為輔助。
`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  
  let parts: any[] = []
  if (textInput) {
    parts.push({ text: textInput })
  }
  if (imageBuffer && imageMimeType) {
    const uint8Array = new Uint8Array(imageBuffer)
    let binaryString = ""
    for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i])
    }
    const base64Image = btoa(binaryString)
    parts.push({
      inline_data: {
        mime_type: imageMimeType,
        data: base64Image
      }
    })
  }

  const payload = {
    system_instruction: {
      parts: [ { text: systemInstruction } ]
    },
    contents: [ { parts } ],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0.1
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error('Gemini API Error:', errText)
    throw new Error('Gemini API call failed')
  }

  const data = await response.json() as any
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!textContent) {
    throw new Error('No text returned from Gemini')
  }

  try {
    const jsonStr = textContent.replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(jsonStr)
  } catch (e) {
    console.error('Failed to parse Gemini output:', textContent)
    throw new Error('Gemini output invalid JSON')
  }
}

export async function extractAmountOnly(apiKey: string, text: string): Promise<number | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const payload = {
    contents: [ { parts: [{ text: `請從以下句子中提取出欲修改的"新金額"數字，不要回傳任何前後綴或符號，只要純數字。若無法判斷請回傳 ERROR。輸入：${text}` }] } ],
    generationConfig: { temperature: 0.1 }
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok) return null;
  const data = await response.json() as any
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!answer || answer.includes('ERROR')) return null;
  const num = parseInt(answer.replace(/\D/g, ''))
  return isNaN(num) ? null : num;
}

export async function processExpenseUpdateWithGemini(
  apiKey: string,
  categories: string[],
  text: string,
  oldRecord: any
): Promise<Partial<{ date: string, item: string, amount: number, suggested_category: string }>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const systemInstruction = `
你是一個專業的私人記帳助理。現在使用者的某一筆舊帳目需要修改。
請根據使用者的修改指令，判斷他究竟想要修改哪些欄位（日期、品項名稱、金額、分類），並回傳**嚴格的 JSON 格式**（千萬不要包含 markdown 或\`\`\`標籤）。

舊帳目的現有資料參考：
${JSON.stringify(oldRecord, null, 2)}

使用者可用的分類有：[${categories.join(', ')}]

請回傳一個 JSON 物件，。**只包含被明確要求修改的欄位**。若未提及某個欄位，請絕對不要把它納入 JSON 結構中。

可回傳的 JSON key 有：
- "date": "YYYY-MM-DD"
- "item": "品項名稱"
- "amount": 數字
- "suggested_category": "合適的分類 (如果無適合請幫忙創建精簡名稱)"

範例情境：
- 如果輸入"金額改成150" => {"amount": 150}
- 如果輸入"其實是昨天的晚餐" => {"date": "昨天算出來的YYYY-MM-DD", "item": "晚餐"}
- 如果不想修改或無法辨識 => {}

若無法辨識任何修改意圖，請回傳空的 JSON 物件：{}。
`
  const payload = {
    system_instruction: { parts: [ { text: systemInstruction } ] },
    contents: [ { parts: [{ text: text }] } ],
    generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
  }

  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!response.ok) return {};
  const data = await response.json() as any
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!answer) return {};
  try { return JSON.parse(answer.replace(/```json/g, '').replace(/```/g, '').trim()) } catch { return {} }
}
