#!/usr/bin/env node

/**
 * Build `content/catalog.json` from this folder convention:
 *
 * content/
 *   01-Chapter/
 *     01-Subchapter/
 *       02-Exercise/
 *         description/description.nl.md OR description/description.md
 *         evaluation/tests.yaml OR evaluation/tests.json OR evaluation/test.yaml OR evaluation/test.json
 *         (optional for theory-items)
 *         starter/starter.py (optional)
 *
 * Usage:
 *   node tools/build-catalog.mjs
 *   node tools/build-catalog.mjs --content ./content --out ./content/catalog.json
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {
    content: "content",
    out: null,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--content" && argv[i + 1]) {
      args.content = argv[i + 1];
      i += 1;
      continue;
    }
    if (current === "--out" && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }
    if (current === "--strict") {
      args.strict = true;
      continue;
    }
  }

  if (!args.out) {
    args.out = path.join(args.content, "catalog.json");
  }

  return args;
}

function parsePrefixedName(name) {
  // Accepts:
  // 01-Sequentie
  // 01_Sequentie
  // 01 Sequentie
  const match = name.match(/^(\d+)[\s\-_]+(.+)$/);
  if (!match) {
    return {
      order: Number.MAX_SAFE_INTEGER,
      rawTitle: name,
    };
  }
  return {
    order: Number.parseInt(match[1], 10),
    rawTitle: match[2],
  };
}

function normalizeTitleFromFolderName(name) {
  const parsed = parsePrefixedName(name);
  return parsed.rawTitle.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function sortByOrderAndName(a, b) {
  const pa = parsePrefixedName(a);
  const pb = parsePrefixedName(b);

  if (pa.order !== pb.order) {
    return pa.order - pb.order;
  }

  return normalizeTitleFromFolderName(a).localeCompare(
    normalizeTitleFromFolderName(b),
    "nl-BE",
    { sensitivity: "base", numeric: true }
  );
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDirectories(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function toPosixRelative(fromDir, toPath) {
  return path.relative(fromDir, toPath).split(path.sep).join(path.posix.sep);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const contentAbs = path.resolve(rootDir, args.content);
  const outAbs = path.resolve(rootDir, args.out);
  const warnings = [];

  if (!(await fileExists(contentAbs))) {
    throw new Error(`Content-map niet gevonden: ${contentAbs}`);
  }

  const chapterNames = (await readDirectories(contentAbs)).sort(sortByOrderAndName);
  const chapters = [];

  for (const chapterName of chapterNames) {
    const chapterAbs = path.join(contentAbs, chapterName);
    const subchapterNames = (await readDirectories(chapterAbs)).sort(sortByOrderAndName);
    const chapterMeta = parsePrefixedName(chapterName);

    const chapter = {
      id: chapterName,
      title: normalizeTitleFromFolderName(chapterName),
      order: chapterMeta.order,
      path: toPosixRelative(rootDir, chapterAbs),
      subchapters: [],
    };

    for (const subchapterName of subchapterNames) {
      const subchapterAbs = path.join(chapterAbs, subchapterName);
      const exerciseNames = (await readDirectories(subchapterAbs)).sort(sortByOrderAndName);
      const subchapterMeta = parsePrefixedName(subchapterName);

      const subchapter = {
        id: `${chapterName}/${subchapterName}`,
        title: normalizeTitleFromFolderName(subchapterName),
        order: subchapterMeta.order,
        path: toPosixRelative(rootDir, subchapterAbs),
        exercises: [],
      };

      for (const exerciseName of exerciseNames) {
        const exerciseAbs = path.join(subchapterAbs, exerciseName);
        const exerciseMeta = parsePrefixedName(exerciseName);

        const descriptionCandidates = [
          path.join(exerciseAbs, "description", "description.nl.md"),
          path.join(exerciseAbs, "description", "description.md"),
        ];
        const testCandidates = [
          path.join(exerciseAbs, "evaluation", "tests.yaml"),
          path.join(exerciseAbs, "evaluation", "tests.json"),
          path.join(exerciseAbs, "evaluation", "test.yaml"),
          path.join(exerciseAbs, "evaluation", "test.json"),
        ];

        const starterCandidates = [
          path.join(exerciseAbs, "starter", "starter.py"),
          path.join(exerciseAbs, "starter.py"),
        ];

        let resolvedDescriptionAbs = null;
        for (const candidate of descriptionCandidates) {
          // eslint-disable-next-line no-await-in-loop
          if (await fileExists(candidate)) {
            resolvedDescriptionAbs = candidate;
            break;
          }
        }
        const hasDescription = Boolean(resolvedDescriptionAbs);
        let resolvedTestsAbs = null;
        for (const candidate of testCandidates) {
          // eslint-disable-next-line no-await-in-loop
          if (await fileExists(candidate)) {
            resolvedTestsAbs = candidate;
            break;
          }
        }
        const hasTests = Boolean(resolvedTestsAbs);

        let resolvedStarterAbs = null;
        for (const candidate of starterCandidates) {
          // eslint-disable-next-line no-await-in-loop
          if (await fileExists(candidate)) {
            resolvedStarterAbs = candidate;
            break;
          }
        }

        if (!hasDescription) {
          warnings.push(
            `[SKIP] ${toPosixRelative(rootDir, exerciseAbs)} ` +
              `-> ontbreekt: ${[
                !hasDescription ? "description/description.nl.md" : null,
                !hasDescription ? "description/description.md" : null,
              ]
                .filter(Boolean)
                .join(", ")}`
          );

          if (args.strict) {
            throw new Error(
              `Ontbrekend verplicht bestand in ${toPosixRelative(rootDir, exerciseAbs)}`
            );
          }

          continue;
        }

        if (!hasTests) {
          warnings.push(
            `[THEORY] ${toPosixRelative(
              rootDir,
              exerciseAbs
            )} -> geen evaluation/tests.yaml/tests.json/test.yaml/test.json, opgenomen als theory-item`
          );
        }

        const itemType = hasTests ? "exercise" : "theory";

        subchapter.exercises.push({
          id: `${chapterName}/${subchapterName}/${exerciseName}`,
          title: normalizeTitleFromFolderName(exerciseName),
          order: exerciseMeta.order,
          type: itemType,
          evaluable: hasTests,
          path: toPosixRelative(rootDir, exerciseAbs),
          descriptionPath: toPosixRelative(rootDir, resolvedDescriptionAbs),
          testsPath: hasTests ? toPosixRelative(rootDir, resolvedTestsAbs) : null,
          testsFormat: hasTests ? path.extname(resolvedTestsAbs).toLowerCase().replace(".", "") : null,
          starterPath: resolvedStarterAbs ? toPosixRelative(rootDir, resolvedStarterAbs) : null,
        });
      }

      if (subchapter.exercises.length > 0) {
        chapter.subchapters.push(subchapter);
      } else {
        warnings.push(
          `[SKIP] ${toPosixRelative(rootDir, subchapterAbs)} -> geen geldige oefeningen gevonden`
        );
      }
    }

    if (chapter.subchapters.length > 0) {
      chapters.push(chapter);
    } else {
      warnings.push(
        `[SKIP] ${toPosixRelative(rootDir, chapterAbs)} -> geen geldige subhoofdstukken gevonden`
      );
    }
  }

  const totalSubchapters = chapters.reduce((sum, chapter) => sum + chapter.subchapters.length, 0);
  const totalExercises = chapters.reduce(
    (sum, chapter) =>
      sum + chapter.subchapters.reduce((inner, subchapter) => inner + subchapter.exercises.length, 0),
    0
  );
  const totalEvaluableExercises = chapters.reduce(
    (sum, chapter) =>
      sum +
      chapter.subchapters.reduce(
        (inner, subchapter) =>
          inner + subchapter.exercises.filter((exercise) => exercise.evaluable).length,
        0
      ),
    0
  );
  const totalTheoryItems = totalExercises - totalEvaluableExercises;

  const catalog = {
    generatedAt: new Date().toISOString(),
    sourceRoot: toPosixRelative(rootDir, contentAbs),
    totals: {
      chapters: chapters.length,
      subchapters: totalSubchapters,
      exercises: totalExercises,
      evaluableExercises: totalEvaluableExercises,
      theoryItems: totalTheoryItems,
    },
    chapters,
  };

  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await fs.writeFile(outAbs, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  console.log(`Catalog geschreven naar: ${toPosixRelative(rootDir, outAbs)}`);
  console.log(
    `Gevonden: ${catalog.totals.chapters} hoofdstukken, ${catalog.totals.subchapters} subhoofdstukken, ${catalog.totals.exercises} items (${catalog.totals.evaluableExercises} met evaluatie, ${catalog.totals.theoryItems} theorie)`
  );

  if (warnings.length > 0) {
    console.log("");
    console.log("Waarschuwingen:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }
}

main().catch((error) => {
  console.error("Catalog build mislukt.");
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});
