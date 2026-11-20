import importlib
import importlib.metadata as md

for pkg in ["langgraph", "langchain", "langchain-core", "langchain-mcp-adapters", "fastmcp", "mcp"]:
    try:
        print(f"{pkg}=={md.version(pkg)}")
    except md.PackageNotFoundError:
        print(f"{pkg}: not installed")

for mod in ["langchain.mcp", "langchain_mcp_adapters.client"]:
    try:
        m = importlib.import_module(mod)
        print(mod, "->", [n for n in dir(m) if not n.startswith("_")])
    except Exception as error:
        print(mod, "-> import failed:", type(error).__name__, error)
