package app.darkfoto.mvp;

import java.util.List;

final class ClipboardSequence {
    interface Writer { void write(String text, int count); }
    interface Scheduler { void after(int delayMs, Runnable next); }
    interface Failure { void fail(Exception error); }

    static void start(List<String> blocks, int intervalMs, Writer writer, Scheduler scheduler,
                      Runnable done, Failure failure) {
        class Step implements Runnable {
            int index = 0;
            @Override public void run() {
                try {
                    writer.write(blocks.get(index), index + 1);
                    index++;
                    if (index < blocks.size()) scheduler.after(intervalMs, this);
                    else done.run();
                } catch (Exception error) { failure.fail(error); }
            }
        }
        new Step().run();
    }
}
