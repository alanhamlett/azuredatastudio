/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { MainContext, MainThreadClipboardShape } from '../common/extHost.protocol';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';

@extHostNamedCustomer(MainContext.MainThreadClipboard)
export class MainThreadClipboard implements MainThreadClipboardShape {

	constructor(
		_context: any,
		@IClipboardService private readonly _clipboardService: IClipboardService,
	) { }

	dispose(): void {
		// nothing
	}

	$readText(): Promise<string> {
		return this._clipboardService.readText();
	}

	$writeText(value: string): Promise<void> {
		return this._clipboardService.writeText(value);
	}
}
