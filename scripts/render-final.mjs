import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || "output");
const INPUT = path.join(OUTPUT_DIR, "fair-crm-01-musteri-proje-sahne.webm");
const OUTPUT = path.join(OUTPUT_DIR, "fair-crm-01-musteri-proje-sahne.mp4");
const VOICEOVER_FILE = process.env.VOICEOVER_FILE ? path.resolve(process.env.VOICEOVER_FILE) : null;

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

if (!(await exists(INPUT))) {
  throw new Error(`Missing source video: ${INPUT}`);
}

const args = ["-y", "-i", INPUT];

if (VOICEOVER_FILE) {
  if (!(await exists(VOICEOVER_FILE))) {
    throw new Error(`VOICEOVER_FILE does not exist: ${VOICEOVER_FILE}`);
  }
  args.push(
    "-i", VOICEOVER_FILE,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    OUTPUT
  );
} else {
  args.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-an",
    "-movflags", "+faststart",
    OUTPUT
  );
}

await run("ffmpeg", args);
console.log(`Final MP4: ${OUTPUT}`);
