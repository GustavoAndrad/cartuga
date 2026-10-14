class AppError(Exception):
    """Base application error mapped to the standard {"error": {code, message}} envelope."""

    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class NotFoundError(AppError):
    status_code = 404
    code = "RESOURCE_NOT_FOUND"

    def __init__(self, message: str = "Registro não encontrado."):
        super().__init__(message)


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"

    def __init__(self, message: str = "Não autenticado."):
        super().__init__(message)


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"

    def __init__(self, message: str = "Acesso negado."):
        super().__init__(message)


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"

    def __init__(self, message: str):
        super().__init__(message)


class ValidationAppError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"

    def __init__(self, message: str):
        super().__init__(message)


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"

    def __init__(self, message: str = "Serviço indisponível no momento."):
        super().__init__(message)
