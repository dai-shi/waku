
import { posthook, prehook } from './src/middleware/index.js';
 const  wakuConfig = {
    middleware: {
        prehook,
        posthook
    },
}
export default wakuConfig;  