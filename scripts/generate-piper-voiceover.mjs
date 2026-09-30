import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || "output");
const SCENARIO_FILE = path.resolve(process.env.SCENARIO_FILE || "scenarios/fair-crm-01.json");
const TIMELINE_FILE = path.join(OUTPUT_DIR, "fair-crm-01.timeline.json");
const PIPER_BIN = path.resolve(process.env.PIPER_BIN || "tools/piper/piper");
const PIPER_MODEL = path.resolve(process.env.PIPER_MODEL || "tools/piper/tr_TR-dfki-medium.onnx");
const VOICE_DIR = path.join(OUTPUT_DIR, "voiceover");
const MIXED_VOICE = path.join(VOICE_DIR, "fair-crm-01-piper.wav");

function run(command, args, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
    if (input !== null) child.stdin.end(input);
    else child.stdin.end();
  });
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function probeDurationMs(file) {
  const value = await capture("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Math.round(Number(value) * 1000);
}

const scenario = JSON.parse(await fs.readFile(SCENARIO_FILE, "utf8"));
const timeline = JSON.parse(await fs.readFile(TIMELINE_FILE, "utf8"));
await fs.mkdir(VOICE_DIR, { recursive: true });

const events = new Map(timeline.events.map((event) => [event.name, event.atMs]));
const segments = scenario.voiceover.segments;

const rendered = [];
for (let index = 0; index < segments.length; index += 1) {
  const segment = segments[index];
  const atMs = events.get(segment.anchor);
  if (atMs == null) throw new Error(`Missing timeline anchor: ${segment.anchor}`);

  const wav = path.join(VOICE_DIR, `segment-${String(index + 1).padStart(2, "0")}.wav`);
  await run(PIPER_BIN, ["--model", PIPER_MODEL, "--output_file", wav], segment.text + "\n");
  const durationMs = await probeDurationMs(wav);
  rendered.push({ wav, atMs, anchor: segment.anchor, durationMs });
  console.log(`✓ Voice ${segment.anchor} @ ${atMs}ms (${durationMs}ms)`);
}

const MIN_GAP_MS = 350;
for (let index = 0; index < rendered.length - 1; index += 1) {
  const current = rendered[index];
  const next = rendered[index + 1];
  const currentEndsAt = current.atMs + current.durationMs;
  const availableGap = next.atMs - currentEndsAt;
  if (availableGap < MIN_GAP_MS) {
    const overlapMs = Math.max(0, -availableGap);
    throw new Error(
      `Narration timing collision: ${current.anchor} -> ${next.anchor}; overlap=${overlapMs}ms, gap=${availableGap}ms, requiredGap=${MIN_GAP_MS}ms`
    );
  }
}

const ffmpegArgs = ["-y"];
for (const segment of rendered) ffmpegArgs.push("-i", segment.wav);

const filters = rendered.map((segment, index) => {
  const delay = Math.max(0, Math.round(segment.atMs));
  return `[${index}:a]adelay=${delay}:all=1[a${index}]`;
});
const mixInputs = rendered.map((_, index) => `[a${index}]`).join("");
filters.push(`${mixInputs}amix=inputs=${rendered.length}:duration=longest:normalize=0[outa]`);

ffmpegArgs.push(
  "-filter_complex", filters.join(";"),
  "-map", "[outa]",
  "-ar", "48000",
  "-ac", "2",
  MIXED_VOICE
);

await run("ffmpeg", ffmpegArgs);
console.log(`Voiceover: ${MIXED_VOICE}`);
