import '../styles.css'

import type { ReactNode } from 'react'

import { Header } from '../components/header'
import { TooltipProvider } from '../components/ui/tooltip'

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout ({ children }: RootLayoutProps) {
  const data = await getData()
  return (
    <div className="font-sans">
      <meta property="description" content={data.description}/>
      <link rel="icon" type="image/png" href={data.icon}/>
      <TooltipProvider>
        <Header/>
        <main className="flex flex-col flex-1 bg-muted/50 dark:bg-background">
          {children}
        </main>
      </TooltipProvider>
    </div>
  )
}

const getData = async () => {
  const data = {
    description: 'An internet website!',
    icon: '/images/favicon.png'
  }

  return data
}
