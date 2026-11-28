/**
 * Import this module before any src module in a test file that runs the engine. src/engine.ts reads
 * FACTORY_TURN_DELAY_MS once when it loads and waits that long (40 ms by default) before each tick of a running run;
 * scripted runs take hundreds of ticks, so the tests switch the wait off. node --test runs every test file in its own
 * process, so the setting needs no restore.
 */
process.env.FACTORY_TURN_DELAY_MS = "0";
