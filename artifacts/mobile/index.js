/**
 * Custom Expo entry point.
 *
 * TaskManager task definitions must be importd (and therefore executed) before
 * the React tree mounts.  When the OS cold-launches the app purely to service a
 * registered background task — without mounting any views — only this entry
 * module and its transitive imports run.  Placing the import here guarantees
 * `TaskManager.defineTask` is called on every JS engine launch, foreground or
 * background.
 *
 * See: https://docs.expo.dev/versions/latest/sdk/task-manager/#taskmanagerdefinetasktaskname-taskexecutor
 */

// 1. Register background task definitions at the global scope
import './tasks/nfbBackgroundFetch';

// 2. Hand off to Expo Router
import 'expo-router/entry';
