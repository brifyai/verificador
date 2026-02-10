import { NextRequest, NextResponse } from 'next/server';
import { model } from '@/lib/gemini';
import { Agent } from 'undici';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { toggleRunPodServer } from '@/lib/runpod-control';

export const maxDuration = 300; // 5 minutes (max for Vercel Pro)

// Configure ffmpeg
const getFfmpegPath = () => {
    if (ffmpegPath) return ffmpegPath;
    // Fallback logic
    const binaryName = os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    return path.join(process.cwd(), 'node_modules', 'ffmpeg-static', binaryName);
};

const validFfmpegPath = getFfmpegPath().startsWith('\\ROOT') 
  ? path.join(process.cwd(), 'node_modules', 'ffmpeg-static', os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg') 
  : getFfmpegPath();

ffmpeg.setFfmpegPath(validFfmpegPath);
console.log("Using ffmpeg path:", validFfmpegPath);

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const readFile = promisify(fs.readFile);

// Custom agent with higher timeout for Whisper API
const whisperAgent = new Agent({
  headersTimeout: 20 * 60 * 1000, // 20 minutes
  connectTimeout: 60 * 1000, // 1 minute
  bodyTimeout: 20 * 60 * 1000, // 20 minutes
});

// Helper to format seconds to MM:SS or HH:MM:SS
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
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      let tempInputPath = '';
      let tempOutputPath = '';
      let lockAcquired = false;

      const sendProgress = (percentage: number, message: string) => {
        try {
            const data = JSON.stringify({ type: 'progress', percentage, message });
            controller.enqueue(encoder.encode(data + '\n'));
        } catch(e) { console.error("Error sending progress", e); }
      };

      const sendResult = (data: any) => {
        try {
            const json = JSON.stringify({ type: 'result', data });
            controller.enqueue(encoder.encode(json + '\n'));
        } catch(e) { console.error("Error sending result", e); }
      };
      
      const sendError = (message: string) => {
        try {
            const json = JSON.stringify({ type: 'error', error: message });
            controller.enqueue(encoder.encode(json + '\n'));
        } catch(e) { console.error("Error sending error", e); }
      };

      try {
        // Acquire Lock for RunPod
        sendProgress(5, "Iniciando sistema y adquiriendo recursos...");
        
        const { getSupabaseAdmin } = await import('@/lib/supabase-admin');
        const supabaseAdmin = getSupabaseAdmin();
        const { data: currentCount, error: lockError } = await supabaseAdmin.rpc('acquire_lock', { resource_id: 'runpod_whisper' });
        
        if (!lockError) {
            lockAcquired = true;
            console.log(`[Lock] Acquired. Count: ${currentCount}`);
        } else {
            console.error("Lock acquisition failed:", lockError);
        }

        // Determine if it's JSON (for Drive files or direct uploads with path) or FormData
        const contentType = req.headers.get('content-type') || '';
        
        let audioFile: File | null = null;
        let phrases: string[] = [];
        let radioId = '';
        let driveFileId: string | undefined = undefined;
        let audioPath: string | undefined = undefined;
        let originalFileName: string = 'audio.mp3';
        
        if (contentType.includes('application/json')) {
            const body = await req.json();
            phrases = body.phrases;
            radioId = body.radioId;
            driveFileId = body.driveFileId;
            audioPath = body.audioPath;
            if (body.fileName) originalFileName = body.fileName;
        } else {
            // Fallback for FormData (should not be used for large files in Vercel)
            const formData = await req.formData();
            audioFile = formData.get('audio') as File;
            const phrasesJson = formData.get('phrases') as string;
            radioId = formData.get('radioId') as string;
            phrases = JSON.parse(phrasesJson);
            if (audioFile) originalFileName = audioFile.name;
        }

        if ((!audioFile && !driveFileId && !audioPath) || !phrases || phrases.length === 0 || !radioId) {
            throw new Error('Faltan campos requeridos (audio/path o frases)');
        }

        let base64Audio = '';
        let uploadedAudioPath: string | null = null;
        
        // Helper for compression
        const compressAudio = async (inputBuffer: Buffer, fileName: string = 'audio.mp3', bitrate: string = '48k'): Promise<Buffer> => {
           const tempDir = os.tmpdir();
           const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
           const ext = fileName.split('.').pop() || 'mp3';
           const tempInputPathLocal = path.join(tempDir, `input-${uniqueSuffix}.${ext}`);
           const tempOutputPathLocal = path.join(tempDir, `output-${uniqueSuffix}.mp3`);

           try {
             await writeFile(tempInputPathLocal, inputBuffer);

             await new Promise((resolve, reject) => {
               ffmpeg(tempInputPathLocal)
                 .audioFrequency(16000)
                 .audioChannels(1)
                 .audioBitrate(bitrate)
                 .output(tempOutputPathLocal)
                 .on('end', resolve)
                 .on('error', reject)
                 .run();
             });

             const compressedBuffer = await readFile(tempOutputPathLocal);
             console.log(`Compressed size (${bitrate}): ${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`);
             
             await unlink(tempInputPathLocal).catch(console.error);
             await unlink(tempOutputPathLocal).catch(console.error);

             return compressedBuffer;
           } catch (error) {
             if (fs.existsSync(tempInputPathLocal)) await unlink(tempInputPathLocal).catch(() => {});
             if (fs.existsSync(tempOutputPathLocal)) await unlink(tempOutputPathLocal).catch(() => {});
             throw error;
           }
        };

        const getOptimizedAudio = async (originalBuffer: Buffer, fileName: string) => {
            // Max safe size for Base64 in 10MB body is approx 7MB
            const MAX_SIZE = 7 * 1024 * 1024; 
            
            let buffer = originalBuffer;
            
            // If original is small enough, return as is (unless it needs format conversion, but let's assume ffmpeg always runs for consistency if > 5MB logic was used)
            // Actually, we want to ensure it fits.
            
            if (buffer.length <= MAX_SIZE && buffer.length <= 5 * 1024 * 1024) {
                 return buffer;
            }

            // Strategy: Try 48k -> 32k -> 24k -> 16k
            const bitrates = ['48k', '32k', '24k', '16k'];
            
            for (const bitrate of bitrates) {
                sendProgress(15, `Optimizando audio (${bitrate})...`);
                try {
                    const compressed = await compressAudio(originalBuffer, fileName, bitrate);
                    if (compressed.length <= MAX_SIZE) {
                        return compressed;
                    }
                    console.log(`Still too large (${(compressed.length/1024/1024).toFixed(2)}MB) at ${bitrate}, trying lower...`);
                } catch (e) {
                    console.error(`Compression failed at ${bitrate}:`, e);
                }
            }
            
            throw new Error(`El archivo de audio es demasiado largo o grande para ser procesado (incluso comprimido supera los límites). Por favor, suba un archivo más corto.`);
        };

        if (driveFileId) {
            sendProgress(10, "Descargando archivo desde Google Drive...");
            
            // Get user for credentials
            const authHeader = req.headers.get('Authorization');
            const { createClient } = await import('@supabase/supabase-js');
            const supabaseServer = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              {
                global: { headers: { Authorization: authHeader || '' } },
              }
            );
            const { data: { user } } = await supabaseServer.auth.getUser();
            
            if (!user) throw new Error('No autorizado');

            // Fetch Global Refresh Token
            const { data: settingsData } = await supabaseAdmin
                .from('system_settings')
                .select('value')
                .eq('key', 'google_refresh_token')
                .single();

            if (!settingsData?.value) {
                throw new Error('Google Drive del sistema no conectado');
            }

            // Fetch file from Drive
            const { getFileStream } = await import('@/lib/drive');
            const stream = await getFileStream(driveFileId, settingsData.value);
            
            const chunks: any[] = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            console.log(`Loaded file from Drive: ${driveFileId}, size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

            sendProgress(20, "Procesando audio de Drive...");
            
            let storageBuffer: any = buffer;
            let storageContentType = 'audio/mpeg';
            
            try {
                const optimizedBuffer = await getOptimizedAudio(buffer, 'drive_audio.mp3');
                base64Audio = optimizedBuffer.toString('base64');
                storageBuffer = optimizedBuffer;
                storageContentType = 'audio/mpeg';
            } catch (err) {
                console.error("Optimization failed for Drive file:", err);
                throw err;
            }

            // Upload to Supabase
            const fileName = `${driveFileId}.mp3`;
            const storagePath = `${radioId}/${fileName}`;
            const { error: uploadError } = await supabaseServer.storage
                .from('audios')
                .upload(storagePath, storageBuffer, {
                    contentType: storageContentType,
                    upsert: true
                });
                
            if (uploadError) {
                console.error("Failed to upload Drive file to Supabase Storage:", uploadError);
            } else {
                console.log(`Uploaded Drive file to Storage: ${storagePath}`);
                uploadedAudioPath = storagePath;
            }
        } else if (audioPath) {
            sendProgress(10, "Descargando archivo desde Storage...");
            uploadedAudioPath = audioPath;
            
            // Get user credentials for Storage access
            const authHeader = req.headers.get('Authorization');
            const { createClient } = await import('@supabase/supabase-js');
            const supabaseServer = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              {
                global: { headers: { Authorization: authHeader || '' } },
              }
            );
            
            // Download file from Storage
            const { data: fileData, error: downloadError } = await supabaseServer.storage
                .from('audios')
                .download(audioPath);

            if (downloadError || !fileData) {
                console.error("Storage download error:", downloadError);
                throw new Error("No se pudo descargar el archivo de audio desde Storage.");
            }
            
            const buffer = Buffer.from(await fileData.arrayBuffer());
            
            try {
                const optimizedBuffer = await getOptimizedAudio(buffer, originalFileName);
                base64Audio = optimizedBuffer.toString('base64');
            } catch (err) {
                console.error("Optimization failed:", err);
                throw err;
            }

        } else if (audioFile) {
            sendProgress(10, "Procesando archivo de audio subido...");
            const buffer = Buffer.from(await audioFile.arrayBuffer());
            
            try {
                const optimizedBuffer = await getOptimizedAudio(buffer, audioFile.name);
                base64Audio = optimizedBuffer.toString('base64');
            } catch (err) {
                console.error("Optimization failed:", err);
                throw err;
            }
        }

        // 2. Transcribir con RunPod API
        sendProgress(30, "Iniciando transcripción con IA (RunPod)...");

        if (!process.env.RUNPOD) {
            throw new Error("Error de configuración: La variable de entorno RUNPOD no está definida en el servidor.");
        }

        const runResponse = await fetch('https://api.runpod.ai/v2/4skn4uyl6f6guu/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RUNPOD}`,
          },
          body: JSON.stringify({
            input: {
                audio_base64: base64Audio,
                model: "turbo",
                transcription: "plain_text",
                temperature: 0,
                temperature_increment_on_fallback: 0.2,
                best_of: 1,
                beam_size: 1,
                patience: 1,
                suppress_tokens: "-1",
                condition_on_previous_text: false,
                compression_ratio_threshold: 2.4,
                logprob_threshold: -1.0,
                no_speech_threshold: 0.8,
                word_timestamps: true,
                initial_prompt: "Esta es una grabación de radio que contiene música de fondo, canciones y publicidad mezclada con locución. Transcribe TODO lo que se hable, incluso si hay música sonando fuerte o si son letras de canciones. No omitas nada."
              }
          }),
          // @ts-ignore
          dispatcher: whisperAgent,
        });

        if (!runResponse.ok) {
          const errorText = await runResponse.text();
          throw new Error(`RunPod API Error: ${runResponse.status} - ${errorText}`);
        }

        const runData = await runResponse.json();
        const jobId = runData.id;
        console.log(`RunPod Job started with ID: ${jobId}`);

        // Poll for status
        let whisperData: any = null;
        let attempts = 0;
        const maxAttempts = 1200; 
        
        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000));
          
          const statusResponse = await fetch(`https://api.runpod.ai/v2/4skn4uyl6f6guu/status/${jobId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.RUNPOD}`,
            },
            // @ts-ignore
            dispatcher: whisperAgent,
          });

          if (!statusResponse.ok) {
            continue;
          }

          const statusData = await statusResponse.json();
          
          // Update progress based on attempts
          // Start at 30%, go up to 80%
          const progressStep = Math.min(50, Math.floor((attempts / 60) * 50)); // Assume 60s for full processing usually
          // Or just slowly increment
          if (attempts % 2 === 0) {
              const currentProgress = 30 + Math.min(50, Math.floor(attempts / 2)); 
              // If attempts=0 -> 30
              // If attempts=100 -> 80
              // Max at 85%
              const p = Math.min(85, currentProgress);
              sendProgress(p, `Transcribiendo audio (Intento ${attempts})...`);
          }

          if (statusData.status === 'COMPLETED') {
            whisperData = statusData.output;
            break;
          } else if (statusData.status === 'FAILED') {
            throw new Error(`RunPod Job Failed: ${JSON.stringify(statusData.error)}`);
          }
          
          attempts++;
        }

        if (!whisperData) {
          throw new Error(`Tiempo de espera agotado para la transcripción.`);
        }

        sendProgress(90, "Transcripción completada. Analizando contenido con Gemini...");

        let transcriptionContext = "";
        let fullTranscription = "";
        
        const segments = whisperData.segments || whisperData.output?.segments;
        const text = whisperData.text || whisperData.transcription || whisperData.output?.text;

        if (segments) {
          transcriptionContext = JSON.stringify(segments.map((s: any) => ({
            start: s.start,
            end: s.end,
            text: s.text
          })), null, 2);
          fullTranscription = JSON.stringify(segments.map((s: any) => ({
            start: s.start,
            end: s.end,
            text: s.text
          })));
        } else if (text) {
          transcriptionContext = text;
          fullTranscription = text;
        } else {
          transcriptionContext = JSON.stringify(whisperData);
          fullTranscription = JSON.stringify(whisperData);
        }

        // 3. Prompt a Gemini
        const prompt = `
          Actúa como un Auditor de Medios profesional.
          
          OBJETIVO:
          Analiza la siguiente TRANSCRIPCIÓN DE AUDIO (generada por Whisper) y busca las frases objetivo.
          
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

          FORMATO DE RESPUESTA (JSON PURO):
          [
            {
              "target_phrase": "Texto exacto buscado",
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
        
        sendProgress(98, "Análisis completado. Guardando resultados...");

        sendResult({ 
            success: true, 
            analysis, 
            full_transcription: fullTranscription,
            audio_path: uploadedAudioPath
        });

      } catch (error: any) {
        console.error('Error en verificación:', error);
        sendError(error.message || 'Error desconocido');
      } finally {
        // Clean up temp files
        if (tempInputPath && fs.existsSync(tempInputPath)) {
          await unlink(tempInputPath).catch(console.error);
        }
        if (tempOutputPath && fs.existsSync(tempOutputPath)) {
          await unlink(tempOutputPath).catch(console.error);
        }

        // Release Lock
        if (lockAcquired) {
            const { getSupabaseAdmin } = await import('@/lib/supabase-admin');
            const supabaseAdmin = getSupabaseAdmin();
            const { data: newCount, error: releaseError } = await supabaseAdmin.rpc('release_lock', { resource_id: 'runpod_whisper' });
            if (!releaseError) {
                console.log(`[Lock] Released. Count: ${newCount}`);
            }
        }
        
        controller.close();
      }
    }
  });
  
  return new NextResponse(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
