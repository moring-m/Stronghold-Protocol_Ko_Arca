"""Create a read-only extraction view of base + updated PC client bundles.
Only additional hard-link directory entries are created; source files are never written.
"""
import argparse
import os
from pathlib import Path


def prepare(base, updates, output):
    base, updates, output = map(Path, (base, updates, output))
    if not base.is_dir():
        raise RuntimeError(f'Base client folder not found: {base}')
    if output.exists():
        raise RuntimeError(f'Use a new staging folder: {output}')
    chosen = {}
    for source in [base, updates]:
        if not source.is_dir():
            continue
        for file in source.rglob('*'):
            if file.is_file() and file.suffix.lower() in ('.ab', '.bin'):
                relative = file.relative_to(source)
                chosen[str(relative).replace('\\', '/').lower()] = (relative, file)
    if not chosen:
        raise RuntimeError('No .ab/.bin bundles found. Send the console output for format inspection.')
    effects = [key for key in chosen if (key.startswith('pkgrps/btl_pfb_fx_') or key.startswith('battle/prefabs/effects/')) and key.endswith('.ab')]
    if not effects:
        examples = '\n'.join(list(chosen)[:20])
        raise RuntimeError('No supported effect bundle filenames found. Bundle sample:\n' + examples)
    output.mkdir(parents=True)
    for relative, original in chosen.values():
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(original, target)
        except OSError as error:
            raise RuntimeError('Hard-link creation failed. Put this kit on the SAME NTFS drive as the CN client, then try again. ' + str(error)) from error
    print(f'Prepared {len(chosen)} bundles; {len(effects)} effect bundles. Updated files take priority.')
    print(f'Client view: {output}')
    return len(chosen)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    parser.add_argument('--updates', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    prepare(args.base, args.updates, args.out)
