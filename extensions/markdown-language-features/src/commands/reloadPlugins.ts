/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager';
import { MarkdownEngine } from '../markdownEngine';
import { MarkdownPreviewManager } from '../preview/previewManager';

export class ReloadPlugins implements Command {
	public readonly id = 'markdown.api.reloadPlugins';

	public constructor(
		private readonly webviewManager: MarkdownPreviewManager,
		private readonly engine: MarkdownEngine,
	) { }

	public execute(): void {
		this.engine.reloadPlugins();
		this.engine.cleanCache();
		this.webviewManager.refresh();
	}
}
