#!/usr/bin/env python3
"""Extract only a verified official Node distribution into a new private root.
No extractall, no archive-owned modes/owners, no writes through archive links.
The caller owns staging cleanup and holds the operation/resource leases.
"""
import os
import posixpath
import shutil
import sys
import tarfile


def extract(archive, destination, prefix):
    if os.path.lexists(destination):
        raise ValueError('destination exists')
    with tarfile.open(archive, 'r:*') as source:
        members = source.getmembers()
        if len(members) > 100000:
            raise ValueError('member limit')
        entries = {}
        total = 0
        for member in members:
            name = member.name.rstrip('/')
            if '\\' in name or '\0' in name or name.startswith('/') or any(p in ('.', '..', '') for p in name.split('/')):
                raise ValueError('archive path')
            parts = name.split('/')
            if parts[0] != prefix:
                raise ValueError('archive prefix')
            relative = '/'.join(parts[1:])
            if not relative:
                if not member.isdir():
                    raise ValueError('archive root')
                continue
            if relative in entries:
                raise ValueError('duplicate archive path')
            if not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
                raise ValueError('special archive file')
            total += member.size
            if total > 1024 * 1024 * 1024 or member.size < 0:
                raise ValueError('archive size')
            entries[relative] = member
        for relative, member in entries.items():
            parent = posixpath.dirname(relative)
            while parent:
                if parent in entries and not entries[parent].isdir():
                    raise ValueError('non-directory ancestor')
                parent = posixpath.dirname(parent)
            if member.issym() or member.islnk():
                link = member.linkname
                if not link or link.startswith('/') or '\\' in link or '\0' in link:
                    raise ValueError('archive link')
                if member.islnk():
                    if not link.startswith(prefix + '/'):
                        raise ValueError('hardlink escape')
                    target = posixpath.normpath(link[len(prefix) + 1:])
                else:
                    target = posixpath.normpath(posixpath.join(posixpath.dirname(relative), link))
                if target.startswith('../') or target in ('..', '.') or target not in entries or not entries[target].isfile():
                    raise ValueError('link escape or non-file target')
        os.mkdir(destination, 0o700)
        for relative, member in entries.items():
            target = os.path.join(destination, relative)
            os.makedirs(os.path.dirname(target), mode=0o700, exist_ok=True)
            if member.isdir():
                os.makedirs(target, mode=0o700, exist_ok=True)
            elif member.isfile():
                with source.extractfile(member) as reader, open(target, 'xb') as writer:
                    shutil.copyfileobj(reader, writer)
                os.chmod(target, 0o700 if member.mode & 0o111 else 0o600)
        for relative, member in entries.items():
            target = os.path.join(destination, relative)
            if member.issym():
                os.symlink(member.linkname, target)
            elif member.islnk():
                os.link(os.path.join(destination, member.linkname[len(prefix) + 1:]), target)


if __name__ == '__main__':
    try:
        extract(*sys.argv[1:])
    except Exception:
        sys.stderr.write('NODE_ARCHIVE_INVALID\n')
        sys.exit(1)
