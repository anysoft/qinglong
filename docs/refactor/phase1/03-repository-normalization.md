# Remote identity normalization

Implemented by `back/shared/gitProvider.ts`. This is a lightweight provider adapter: a host map supplies provider presentation and known GitHub case behavior, while execution always uses generic Git. Branch, credential, display name and alias never participate in identity.

| Input | Identity |
| --- | --- |
| https://github.com/anysoft/test.git | github.com/anysoft/test |
| https://github.com/anysoft/test | github.com/anysoft/test |
| git@github.com:anysoft/test.git | github.com/anysoft/test |
| ssh://git@github.com/anysoft/test.git | github.com/anysoft/test |
| ssh://git@GIT.EXAMPLE/team/a/b/Project.git | git.example/team/a/b/Project |
| ssh://git@git.example:2222/team/Project.git | git.example:2222/team/Project |

Hosts are lowercase; GitHub identity paths are lowercase. GitLab, Gitee and Generic paths retain case. Full nested path is retained; owner may have multiple segments or be empty. Terminal `.git`, redundant slashes and trailing slash are removed from identity. Default HTTPS 443 / SSH 22 do not distinguish identities, nondefault ports do.

Safe original spelling stays in `remote_url`; normalization does not rewrite transport. This distinction matters because the old shell uses raw spelling to compute paths. Equivalent URL conversion reuses an existing resource only when old checkout names agree; otherwise it rejects with a compatibility explanation. Creating duplicate identity always returns conflict.

Conservative Phase 1 grammar accepts HTTPS, SCP-style SSH and ssh://. It rejects HTTP, file/ext protocols, HTTPS userinfo, SSH password, unsafe username, controls/whitespace, percent encoding, query/fragment, dot segments, IPv6 literal hosts and unsupported path characters. These are explicit new-resource restrictions; old manual URLs remain on their existing path. Generic single-component or nested identities are allowed, but some spellings cannot pass the legacy checkout adapter's stricter layout validation.

Provider-specific host keys are not fetched automatically or blindly trusted. All SSH operations require administrator-verified known_hosts. Generic Git is selected automatically for other domains and is available as a credential provider.
