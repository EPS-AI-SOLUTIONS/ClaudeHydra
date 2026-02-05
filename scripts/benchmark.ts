import http from 'http';

const PROMPT = "Write a short poem about coding in the moonlight.";
const MODEL = "llama3.2:3b";

async function runBenchmark() {
  console.log(`🚀 Benchmarking ${MODEL}...`);
  
  const start = process.hrtime();
  
  const req = http.request('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
      const end = process.hrtime(start);
      const durationSec = end[0] + end[1] / 1e9;
      
      const lines = raw.trim().split('\n');
      let totalEvalCount = 0;
      let totalEvalDuration = 0;
      
      // Parse last line for stats (Ollama streams JSON lines)
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        totalEvalCount = last.eval_count;
        totalEvalDuration = last.eval_duration; // nanoseconds
        
        const tps = totalEvalCount / (totalEvalDuration / 1e9);
        console.log(`
📊 Results:`);
        console.log(`   Tokens Generated: ${totalEvalCount}`);
        console.log(`   Total Time:       ${durationSec.toFixed(2)}s`);
        console.log(`   Speed:            ${tps.toFixed(2)} tokens/sec`);
      } catch (e) {
        console.log('Error parsing stats. Ensure model is loaded.');
      }
    });
  });

  req.write(JSON.stringify({ model: MODEL, prompt: PROMPT }));
  req.end();
}

runBenchmark();