import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
	title: "seiton",
	tagline: "Interactive command-line auditor for Bitwarden vaults",
	favicon: "img/favicon.ico",

	future: {
		v4: true,
	},

	url: "https://antperez69367.github.io",
	baseUrl: "/seiton/",

	organizationName: "antperez69367",
	projectName: "seiton",

	onBrokenLinks: "throw",
	onBrokenMarkdownLinks: "warn",

	i18n: {
		defaultLocale: "en",
		locales: ["en"],
	},

	presets: [
		[
			"classic",
			{
				docs: {
					sidebarPath: "./sidebars.ts",
					routeBasePath: "docs",
				},
				blog: false,
				theme: {
					customCss: "./src/css/custom.css",
				},
			} satisfies Preset.Options,
		],
	],

	themeConfig: {
		colorMode: {
			respectPrefersColorScheme: true,
		},
		navbar: {
			title: "seiton",
			items: [
				{
					type: "docSidebar",
					sidebarId: "docsSidebar",
					position: "left",
					label: "Documentation",
				},
				{
					href: "https://github.com/seiton-cli/seiton",
					label: "GitHub",
					position: "right",
				},
			],
		},
		footer: {
			style: "dark",
			links: [
				{
					title: "Documentation",
					items: [
						{
							label: "Getting Started",
							to: "/docs/getting-started/installation",
						},
						{ label: "User Guide", to: "/docs/user-guide/overview" },
						{
							label: "Contributing",
							to: "/docs/contributing/development-setup",
						},
					],
				},
				{
					title: "More",
					items: [
						{ label: "GitHub", href: "https://github.com/seiton-cli/seiton" },
						{ label: "npm", href: "https://www.npmjs.com/package/seiton" },
					],
				},
			],
			copyright: `Copyright \u00a9 ${new Date().getFullYear()} seiton contributors. MIT License.`,
		},
		prism: {
			theme: prismThemes.github,
			darkTheme: prismThemes.dracula,
			additionalLanguages: ["bash", "json"],
		},
	} satisfies Preset.ThemeConfig,
};

export default config;
