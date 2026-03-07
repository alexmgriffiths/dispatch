export default function DispatchLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Send/dispatch arrow — like a paper plane but geometric */}
      <path
        d="M5 27L28 16L5 5V14L20 16L5 18V27Z"
        className="fill-primary"
      />
    </svg>
  )
}
