import os

CONST = 10


class Client:
    def __init__(self, port):
        self.port = port

    def fetch(self):
        return _norm(self.port)

    def _internal(self):
        pass


def _norm(v):
    return v


def public_fn():
    def local():
        return 2
    return _norm(local())
