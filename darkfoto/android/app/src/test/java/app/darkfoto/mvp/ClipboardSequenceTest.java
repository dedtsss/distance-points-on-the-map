package app.darkfoto.mvp;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class ClipboardSequenceTest {
    @Test
    public void writesSeparateOrderedEventsWithBoundedSpacing() {
        List<String> events = new ArrayList<>();
        List<Runnable> pending = new ArrayList<>();
        List<Integer> intervals = new ArrayList<>();
        List<Exception> errors = new ArrayList<>();
        boolean[] done = { false };
        ClipboardSequence.start(Arrays.asList("#6300", "#6301", "#6302"), 220,
            (text, count) -> events.add(count + ":" + text),
            (delay, next) -> { intervals.add(delay); pending.add(next); },
            () -> done[0] = true, errors::add);
        while (!pending.isEmpty()) pending.remove(0).run();
        assertEquals(Arrays.asList("1:#6300", "2:#6301", "3:#6302"), events);
        assertEquals(Arrays.asList(220, 220), intervals);
        assertTrue(done[0]);
        assertTrue(errors.isEmpty());
    }
}
