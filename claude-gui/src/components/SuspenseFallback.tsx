import { motion } from 'framer-motion';

interface SuspenseFallbackProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Matrix-themed loading spinner component for Suspense fallbacks
 * Uses CSS variables for theming consistency
 * @param message - Optional custom loading message
 * @param size - Size variant: sm (12px), md (16px), lg (20px)
 */
export function SuspenseFallback({
  message = 'Loading module...',
  size = 'md',
}: SuspenseFallbackProps) {
  const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const borderSizeMap = {
    sm: 'border-2',
    md: 'border-2',
    lg: 'border-4',
  };

  return (
    <div className="flex-1 glass-panel flex items-center justify-center min-h-[200px]">
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Animated spinner ring */}
        <div className="relative">
          {/* Static outer ring */}
          <div
            className={`${sizeMap[size]} ${borderSizeMap[size]} border-matrix-accent/30 rounded-full`}
          />
          {/* Rotating inner ring */}
          <motion.div
            className={`absolute inset-0 ${sizeMap[size]} ${borderSizeMap[size]} border-matrix-accent border-t-transparent rounded-full`}
            animate={{ rotate: 360 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </div>

        {/* Loading text */}
        <motion.span
          className="text-matrix-accent text-sm font-mono"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {message}
        </motion.span>

        {/* Pulsing dots underneath */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-matrix-accent"
              animate={{ scale: [0.8, 1, 0.8] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
