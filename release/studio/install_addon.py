"""Load the development XPI into the isolated capture browser."""
from pathlib import Path
import argparse
import json
from marionette_driver.addons import Addons
from marionette_driver.marionette import Marionette


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=2830)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--settings', type=Path)
    parser.add_argument('--settings-only', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    client = Marionette(host='127.0.0.1', port=args.port)
    client.start_session()
    try:
        addon_id = json.loads(args.receipt.read_text(encoding='utf-8'))['id'] if args.settings_only else Addons(client).install(str(root / 'build/aurora-universal-development.xpi'), temp=True)
        client.set_context('chrome')
        info = client.execute_async_script('''const done=arguments[arguments.length-1];
const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
AddonManager.getAddonByID(arguments[0]).then(a=>done({id:a.id,version:a.version,active:a.isActive,url:WebExtensionPolicy.getByID(a.id).getURL('popup.html')}));''', script_args=[addon_id])
        client.set_context('content')
        original = client.current_window_handle
        opened = client.open(type='tab')
        client.switch_to_window(opened['handle'])
        client.navigate(info['url'])
        settings = json.loads(args.settings.read_text(encoding='utf-8')) if args.settings else {
            'hasSeenWelcomeScreen': True, 'theme': 'dark', 'appearance': 'clear',
            'glassIntensity': 70, 'customBgUrl': '__gpt5_animated__', 'backgroundBlur': '60',
            'hideUpgradeButtons': True, 'hideAIWarnings': True, 'hideQuickSettings': False}
        client.execute_async_script('''const done=arguments[arguments.length-1];
browser.storage.sync.set(arguments[0]).then(()=>done(true));''', script_args=[settings], sandbox=None)
        client.close()
        client.switch_to_window(original)
        args.receipt.write_text(json.dumps(info, indent=2), encoding='utf-8')
        print('Loaded Aurora into the signed-out capture profile')
    finally:
        client.delete_session()


if __name__ == '__main__':
    main()
