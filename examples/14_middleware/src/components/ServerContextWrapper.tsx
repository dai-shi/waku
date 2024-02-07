import { useServerProvider } from "../use-server-provider.js";

export const ServerContextWrapper = async ({context,children})=>{
    useServerProvider('context', context);
    return children;
}
