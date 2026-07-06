package app;

public class App {
    private int port;

    public App(int port) {
        this.port = port;
    }

    public void start() {
        helper();
    }

    static String helper() {
        return "x";
    }
}

class Internal {
    void run() {}
}

interface Api {
    void serve();
}

public enum Mode {
    FAST,
    SLOW
}
