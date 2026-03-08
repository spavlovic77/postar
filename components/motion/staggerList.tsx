"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
}

export function StaggerList({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children }: { children: ReactNode }) {
  return <motion.div variants={itemVariants}>{children}</motion.div>
}
