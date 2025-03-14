/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'wakustackdemoapp',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      home: 'aws',
    };
  },
  async run() {
    new sst.aws.Waku('WakuStackDemoApp');
  },
});
