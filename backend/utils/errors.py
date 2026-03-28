class PredictionPipelineError(Exception):
    """Controlled API error with HTTP status code."""

    def __init__(
        self,
        message: str,
        status_code: int = 400,
        *,
        error_code: str | None = None,
        details: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.error_code = error_code
        self.details = details
