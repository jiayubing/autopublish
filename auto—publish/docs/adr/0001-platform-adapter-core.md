# Separate the publishing core from platform adapters and the desktop console

This project started as a single Lieju script, but it is intended to grow into a multi-platform publisher and later a desktop application. We will keep one shared Publishing Core for document conversion, job orchestration, logging, and state handling; implement each Publication Platform as an isolated Platform Adapter; and treat the future Desktop Console as a thin operator layer over the same core so new platforms do not require UI or workflow rewrites.
