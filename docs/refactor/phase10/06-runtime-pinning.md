# Phase 10 — Runtime pins

Python 采用 Phase 7 Resolver 的不可变 venv Build 和 shared Build lease，Runtime 引用由既有 Environment/Build 引用体系保护。Node 使用 Phase 8 Build shared lease，加 Runtime / Toolchain shared lease。

Environment 在运行期间可以产生并推广新的 Build；已开始的 Run 和全部 retry 仍使用旧 Build，新 Run 才能观察推广结果。删除、重建或清理被 pin 住的实体必须遵守原有 shared/exclusive 锁。

真实验收使用官方 CPython 3.13.15、官方 Node 24.21.0、npm 11.19.0、tsx 4.20.6；版本是本次验收输入，不是产品默认升级策略。Python 使用本地 wheelhouse；Node 实际安装并运行第三方模块及 tsx。
