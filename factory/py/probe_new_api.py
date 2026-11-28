"""Container check: prints the LangGraph and MCP package versions of one venv.

run-tests.sh runs it in the Docker image for the legacy and the new venv before langgraph_client.py,
so the log shows which packages and MCP adapter modules each venv has. It never fails the run.
"""

import importlib
import importlib.metadata as metadata

PACKAGES = ["langgraph", "langchain", "langchain-core", "langchain-mcp-adapters", "fastmcp", "mcp"]
ADAPTER_MODULES = ["langchain.mcp", "langchain_mcp_adapters.client"]


def print_versions() -> None:
    """Prints `<package>==<version>`, or that the package is not installed."""
    for package in PACKAGES:
        try:
            print(f"{package}=={metadata.version(package)}")
        except metadata.PackageNotFoundError:
            print(f"{package}: not installed")


def print_adapter_modules() -> None:
    """Prints the public names of each MCP adapter module, or why it does not import."""
    for name in ADAPTER_MODULES:
        try:
            module = importlib.import_module(name)
            print(name, "->", [member for member in dir(module) if not member.startswith("_")])
        except Exception as error:
            print(name, "-> import failed:", type(error).__name__, error)


if __name__ == "__main__":
    print_versions()
    print_adapter_modules()
