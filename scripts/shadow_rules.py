"""Index detached shadows from the same CSS that declares them."""

import re


CSS_TOKEN = re.compile(r'''/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.|[(){\[\]};,]''')
MARKER = re.compile(r'var\(\s*(--aurora-cast-[\w-]+)\s*\)')
MARKER_REFERENCE = re.compile(r'var\(\s*(--aurora-cast-[\w-]+)')
PSEUDO = re.compile(r'(?<!\\)::?(before|after)$', re.I)
LOCAL_SHADOWS = {'var(--switch-shadow)', 'var(--shadow-mode-toggle-selected)'}


def rules_and_declarations(source):
    """Yield a rule's effective selector and declarations, including nested rules."""
    source = re.sub(r'/\*[\s\S]*?\*/', ' ', source)
    blocks = [('', False)]
    start = depth = 0
    for match in CSS_TOKEN.finditer(source):
        token = match[0]
        if token in ('[', '('):
            depth += 1
        elif token in (']', ')'):
            depth -= 1
        elif not depth and token in '{};':
            statement = source[start:match.start()].strip()
            start = match.end()
            selector, keyframes = blocks[-1]
            if token == '{':
                if statement.startswith('@'):
                    blocks.append((selector, keyframes or 'keyframes' in statement.split()[0]))
                elif keyframes or not selector:
                    blocks.append((statement, keyframes))
                else:
                    parent = f':is({selector})'
                    nested = ','.join(part.replace('&', parent) if '&' in part else f'{parent} {part}'
                                      for part in split_list(statement))
                    blocks.append((nested, keyframes))
            else:
                if selector and ':' in statement:
                    name, value = statement.split(':', 1)
                    yield selector, name.strip(), value.removesuffix('!important').strip(), keyframes
                if token == '}':
                    blocks.pop()


def split_list(value):
    start = depth = 0
    for match in CSS_TOKEN.finditer(value):
        token = match[0]
        if token in ('[', '('):
            depth += 1
        elif token in (']', ')'):
            depth -= 1
        elif not depth and token == ',':
            yield value[start:match.start()].strip()
            start = match.end()
    yield value[start:].strip()


def shadow_rules(path, css, markers):
    indexed = {'element': set(), 'before': set(), 'after': set()}
    for selector, name, value, keyframes in rules_and_declarations(css):
        references = set(MARKER_REFERENCE.findall(value))
        if references and (references - markers or references != set(MARKER.findall(value))):
            raise ValueError(f'{path}: use defined cast markers without a local fallback ({selector})')
        if name in ('box-shadow', '--composer-layout-surface-shadow', '--tw-shadow'):
            for layer in split_list(value):
                if layer in {'none', *LOCAL_SHADOWS} or MARKER.fullmatch(layer):
                    continue
                if re.search(r'\binset\b', layer) or re.fullmatch(r'var\(--tw-ring[\w-]*,\s*0 0 #0000\)', layer):
                    continue
                # The original outline is part of the focused control's affordance.
                if selector.endswith(':focus') and layer == '0 0 0 2px rgba(255, 255, 255, 0.1)':
                    continue
                # Stars are wallpaper artwork and live behind all website surfaces.
                if path == 'theme-background.css' and selector.endswith(' .space-twinkle'):
                    continue
                raise ValueError(f'{path}: cast shadows must use the detached renderer ({selector}, {layer})')
        if name.startswith('--aurora-cast-') and path != 'glass-shadows.css':
            raise ValueError(f'{path}: cast markers belong to glass-shadows.css ({name})')
        if not references and name != '--aurora-shadow-probe':
            continue
        if keyframes:
            raise ValueError(f'{path}: animate the shadow value, not its paint marker ({selector})')
        for part in split_list(selector):
            pseudo = PSEUDO.search(part)
            if pseudo:
                indexed[pseudo[1].lower()].add(part[:pseudo.start()])
            else:
                indexed['element'].add(part)
    return {part: sorted(selectors) for part, selectors in indexed.items()}
