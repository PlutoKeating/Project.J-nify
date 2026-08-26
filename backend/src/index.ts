import { makeApp } from './app';

export default makeApp(process.env as unknown as Parameters<typeof makeApp>[0]);
