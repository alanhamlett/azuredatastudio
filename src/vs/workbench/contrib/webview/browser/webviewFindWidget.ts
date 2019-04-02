/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimpleFindWidget } from 'vs/editor/contrib/find/simpleFindWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Webview } from 'vs/workbench/contrib/webview/common/webview';

export class WebviewFindWidget extends SimpleFindWidget {

	constructor(
		private _webview: Webview | undefined,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(contextViewService, contextKeyService);
	}

	dispose() {
		this._webview = undefined;
		super.dispose();
	}

	public find(previous: boolean) {
		if (!this._webview) {
			return;
		}
		const val = this.inputValue;
		if (val) {
			this._webview.find(val, previous);
		}
	}

	public hide() {
		super.hide();
		if (this._webview) {
			this._webview.stopFind(true);
			this._webview.focus();
		}
	}

	public onInputChanged() {
		if (!this._webview) {
			return;
		}
		const val = this.inputValue;
		if (val) {
			this._webview.startFind(val);
		} else {
			this._webview.stopFind(false);
		}
	}

	protected onFocusTrackerFocus() { }

	protected onFocusTrackerBlur() { }

	protected onFindInputFocusTrackerFocus() { }

	protected onFindInputFocusTrackerBlur() { }
}