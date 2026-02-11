import { NextRequest, NextResponse } from 'next/server';
import { model } from '@/lib/gemini';

// Helper to format seconds to MM:SS or HH:MM:SS (reused from verify/route.ts)
const formatTime = (seconds: number) => {
  if (!seconds && seconds !== 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { transcription, phrases } = body;

        if (!transcription || !phrases || phrases.length === 0) {
            return NextResponse.json({ error: 'Faltan datos requeridos (transcripción o frases)' }, { status: 400 });
        }

        // Use the same logic as verify/route.ts but without audio processing
        let transcriptionContext = transcription;
        
        // If it's a JSON string of segments, keep it that way for context. 
        // If it's plain text, use it as is.
        // The frontend sends what it has stored.

        const prompt = `
          Actúa como un Auditor de Medios profesional.
          
          OBJETIVO:
          Analiza la siguiente TRANSCRIPCIÓN DE AUDIO (previamente generada) y busca las nuevas frases objetivo.
          
          CONTEXTO (Segmentos de transcripción con tiempos):
          ${transcriptionContext} 
          
          LISTA DE FRASES A BUSCAR:
          ${phrases.map((p: string, i: number) => `${i + 1}. "${p}"`).join('\n')}

          INSTRUCCIONES:
          1. Busca cada una de las FRASES A BUSCAR en el CONTEXTO.
          2. IMPORTANTE: Las frases pueden estar divididas en múltiples segmentos consecutivos. Debes buscar a través de los límites de los segmentos.
          3. Si el usuario proporciona una frase larga, busca la secuencia de palabras independientemente de si está en uno o varios segmentos.
          4. Extrae el 'start' y 'end' EXACTOS (en segundos, números) del segmento (o rango de segmentos) donde aparece la frase.
          5. Si la frase abarca varios segmentos, usa el start del primero y el end del último.
          6. NO conviertas los tiempos a formato "MM:SS", devuélvelos como números (ej: 125.5).
          7. Sé flexible con errores menores de transcripción (ej: "diversion" vs "dibersión") o puntuación.
          8. Prioriza encontrar la ubicación correcta (timestamps) aunque el texto transcrito tenga ligeras variaciones.
          9. DEBES devolver UN objeto en el array por CADA frase buscada, incluso si no se encuentra. Si no se encuentra, pon "is_match": false.
          10. REGLA CRÍTICA: El array de respuesta DEBE tener EXACTAMENTE el mismo número de objetos que la lista de frases de entrada.
          11. Si recibes 3 frases, devuelve un array de 3 objetos. Si recibes 5, devuelve 5.
          12. NO fusiones resultados. Si una frase no se encuentra, devuelve el objeto con "is_match": false.
          13. Mantén el orden estricto: El objeto 1 corresponde a la frase 1, el objeto 2 a la frase 2, etc.

          FORMATO DE RESPUESTA (JSON PURO):
          [
            {
              "target_phrase": "Texto exacto buscado (copiar de la lista de entrada)",
              "is_match": boolean, 
              "transcription": "Texto encontrado en el segmento (o vacío si no se encontró)",
              "validation_rate": "High" | "Medium" | "Low",
              "start_seconds": number (segundos exactos del inicio, ej: 1395.5, o null si no se encontró),
              "end_seconds": number (segundos exactos del final, ej: 1401.2, o null si no se encontró),
              "details": "Explica la coincidencia encontrada o por qué no se encontró."
            }
          ]
        `;

        const result = await model.generateContent([prompt]);
        const responseText = result.response.text();
        const jsonString = responseText.replace(/```json|```/g, '').trim();
        const rawAnalysis = JSON.parse(jsonString);
        
        // Post-process to format times
        const analysis = rawAnalysis.map((item: any) => ({
            ...item,
            timestamp_start: item.start_seconds ? formatTime(item.start_seconds) : "",
            timestamp_end: item.end_seconds ? formatTime(item.end_seconds) : ""
        }));

        return NextResponse.json({ success: true, analysis });

    } catch (error: any) {
        console.error('Error en reverificación:', error);
        return NextResponse.json({ error: error.message || 'Error desconocido' }, { status: 500 });
    }
}