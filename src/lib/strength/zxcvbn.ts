import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import {
	adjacencyGraphs,
	dictionary as commonDictionary,
} from "@zxcvbn-ts/language-common";
import { dictionary, translations } from "@zxcvbn-ts/language-en";

zxcvbnOptions.setOptions({
	dictionary: {
		...commonDictionary,
		...dictionary,
	},
	graphs: adjacencyGraphs,
	translations,
});

import type { ZxcvbnScoreResult } from "./types.js";

export type { ZxcvbnScoreResult } from "./types.js";

export function zxcvbnScore(
	password: string,
	userDictionary: readonly string[],
): ZxcvbnScoreResult {
	const result = zxcvbn(password, [...userDictionary]);

	const feedback: string[] = [];
	if (result.feedback.warning) {
		feedback.push(result.feedback.warning);
	}
	for (const suggestion of result.feedback.suggestions) {
		feedback.push(suggestion);
	}

	return { score: result.score, feedback };
}
