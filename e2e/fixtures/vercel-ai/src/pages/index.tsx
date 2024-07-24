"use server";
import { AI } from '../actions'
import { Inner } from './inner'

export default function Page () {
  return (
    <AI>
      <Inner/>
    </AI>
  )
}
