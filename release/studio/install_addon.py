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
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    client = Marionette(host='127.0.0.1', port=args.port)
    client.start_session()
    try:
        addon_id = Addons(client).install(str(root / 'build/aurora-universal-development.xpi'), temp=True)
        client.set_context('chrome')
        info = client.execute_async_script('''const done=arguments[arguments.length-1];
const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
AddonManager.getAddonByID(arguments[0]).then(a=>done({id:a.id,version:a.version,active:a.isActive,url:WebExtensionPolicy.getByID(a.id).getURL('popup.html')}));''', script_args=[addon_id])
        client.set_context('content')
        original = client.current_window_handle
        opened = client.open(type='tab')
        client.switch_to_window(opened['handle'])
        client.navigate(info['url'])
        client.execute_async_script('''const done=arguments[arguments.length-1];
browser.storage.sync.set({hasSeenWelcomeScreen:true,theme:'dark',appearance:'clear',
glassIntensity:70,customBgUrl:'__gpt5_animated__',backgroundBlur:'60',
hideUpgradeButtons:true,hideAIWarnings:true,hideQuickSettings:false}).then(()=>done(true));''', sandbox=None)
        client.close()
        client.switch_to_window(original)
        args.receipt.write_text(json.dumps({key: info[key] for key in ('id', 'version', 'active')}, indent=2), encoding='utf-8')
        print('Loaded Aurora into the signed-out capture profile')
    finally:
        client.delete_session()


if __name__ == '__main__':
    main()
