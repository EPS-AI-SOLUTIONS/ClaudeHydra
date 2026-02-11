/**
 * Heavy Computation Web Worker
 * Offloads CPU-intensive tasks to prevent UI blocking
 *
 * Usage:
 * const worker = new Worker(new URL('./workers/heavyComputation.worker.ts', import.meta.url), { type: 'module' });
 * worker.postMessage({ type: 'prime', iterations: 50000 });
 * worker.onmessage = (e) => console.log(e.data);
 */

type WorkerMessage =
  | { type: 'prime'; iterations: number }
  | { type: 'hash'; data: string }
  | { type: 'sort'; data: number[] }
  | { type: 'search'; data: string[]; query: string };

type WorkerResponse =
  | { type: 'progress'; value: number }
  | { type: 'result'; value: unknown }
  | { type: 'error'; message: string };

// Check if number is prime
function isPrime(num: number): boolean {
  if (num < 2) return false;
  for (let i = 2, s = Math.sqrt(num); i <= s; i++) {
    if (num % i === 0) return false;
  }
  return true;
}

// Find Nth prime number
function findNthPrime(n: number, reportProgress: (p: number) => void): number {
  let count = 0;
  let num = 2;
  const reportInterval = Math.max(1, Math.floor(n / 20));

  while (count < n) {
    if (isPrime(num)) {
      count++;
      if (count % reportInterval === 0) {
        reportProgress((count / n) * 100);
      }
    }
    num++;
  }
  return num - 1;
}

// Simple hash function (djb2)
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

// Merge sort implementation
function mergeSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;

  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));

  const result: number[] = [];
  let l = 0,
    r = 0;

  while (l < left.length && r < right.length) {
    if (left[l] < right[r]) {
      result.push(left[l++]);
    } else {
      result.push(right[r++]);
    }
  }

  return result.concat(left.slice(l)).concat(right.slice(r));
}

// Fuzzy search with Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function fuzzySearch(
  data: string[],
  query: string,
  reportProgress: (p: number) => void,
): Array<{ item: string; score: number }> {
  const results: Array<{ item: string; score: number }> = [];
  const queryLower = query.toLowerCase();
  const reportInterval = Math.max(1, Math.floor(data.length / 20));

  for (let i = 0; i < data.length; i++) {
    const itemLower = data[i].toLowerCase();
    const distance = levenshteinDistance(queryLower, itemLower);
    const score = 1 - distance / Math.max(query.length, data[i].length);

    if (score > 0.3) {
      results.push({ item: data[i], score });
    }

    if (i % reportInterval === 0) {
      reportProgress((i / data.length) * 100);
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 50);
}

// Message handler
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const respond = (response: WorkerResponse) => self.postMessage(response);
  const reportProgress = (value: number) => respond({ type: 'progress', value });

  try {
    switch (e.data.type) {
      case 'prime': {
        const result = findNthPrime(e.data.iterations, reportProgress);
        respond({ type: 'result', value: result });
        break;
      }

      case 'hash': {
        const result = hashString(e.data.data);
        respond({ type: 'result', value: result });
        break;
      }

      case 'sort': {
        reportProgress(10);
        const result = mergeSort(e.data.data);
        reportProgress(100);
        respond({ type: 'result', value: result });
        break;
      }

      case 'search': {
        const results = fuzzySearch(e.data.data, e.data.query, reportProgress);
        respond({ type: 'result', value: results });
        break;
      }

      default:
        respond({ type: 'error', message: 'Unknown operation type' });
    }
  } catch (err) {
    respond({ type: 'error', message: String(err) });
  }
};

export {};
