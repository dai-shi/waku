'use server';

import type { ReactNode } from 'react';

export const ping = async () => {
  return 'pong';
};

export const increase = async (value: number) => {
  return value + 1;
};

export const wrap = async (node: ReactNode) => {
  return <span className="via-server">{node}</span>;
};

export const getData = async () => {
  return <span className="server-data">Server Data</span>;
};

export const updateContent = async () => 'update-content';
