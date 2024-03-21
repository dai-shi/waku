'use client';

import { useState } from 'react';
import cx from 'classnames';

type LogoProps = {
  className?: string;
};

export const Logo = ({ className = '' }: LogoProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleContextMenu = (event: any) => {
    event.preventDefault();
    setIsMenuOpen(!isMenuOpen);
  };

  const handleClose = () => {
    setTimeout(() => {
      setIsMenuOpen(false);
    }, 100);
  };

  return (
    <div className="relative flex w-full justify-center">
      <img
        onContextMenu={handleContextMenu}
        src="https://cdn.candycode.com/waku/waku-logo-shadow.svg"
        alt="Waku"
        className={cx('block w-full', className)}
      />
      <span className="sr-only">Waku</span>
      {isMenuOpen && (
        <div
          onContextMenu={handleContextMenu}
          className="absolute -inset-8 flex items-center justify-center overflow-clip rounded-xl backdrop-blur-sm"
        >
          <a
            href="https://cdn.candycode.com/waku/waku-logo.zip"
            download={true}
            onClick={handleClose}
            className="text-red-50 whitespace-nowrap rounded-md bg-primary-700 px-6 py-3 text-xl font-black uppercase leading-none tracking-wide transition-colors duration-300 ease-in-out hover:bg-primary-500 focus:ring-4 focus:ring-primary-300"
          >
            waku-logo.zip
          </a>
        </div>
      )}
    </div>
  );
};
