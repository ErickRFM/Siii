import type {Config} from 'tailwindcss';
import animate from 'tailwindcss-animate';

const hsl=(name:string)=>`hsl(var(${name}) / <alpha-value>)`;

const config:Config={
 darkMode:['selector','[data-sii-theme="dark"]'],
 content:['./src/app/**/*.{ts,tsx}','./src/components/**/*.{ts,tsx}','./src/shared/**/*.{ts,tsx}'],
 corePlugins:{preflight:false},
 theme:{
  container:{center:true,padding:'1.5rem',screens:{'2xl':'1400px'}},
  extend:{
   colors:{
    border:hsl('--border'),
    input:hsl('--input'),
    ring:hsl('--ring'),
    background:hsl('--background'),
    foreground:hsl('--foreground'),
    card:{DEFAULT:hsl('--card'),foreground:hsl('--card-foreground')},
    popover:{DEFAULT:hsl('--popover'),foreground:hsl('--popover-foreground')},
    surface:{DEFAULT:hsl('--card'),soft:hsl('--secondary')},
    primary:{DEFAULT:hsl('--primary'),dark:hsl('--primary-dark'),soft:hsl('--primary-soft'),foreground:hsl('--primary-foreground')},
    secondary:{DEFAULT:hsl('--secondary'),foreground:hsl('--secondary-foreground')},
    muted:{DEFAULT:hsl('--muted'),foreground:hsl('--muted-foreground')},
    accent:{DEFAULT:hsl('--accent'),foreground:hsl('--accent-foreground')},
    destructive:{DEFAULT:hsl('--destructive'),foreground:hsl('--destructive-foreground')},
    success:{DEFAULT:hsl('--success'),foreground:hsl('--success-foreground')},
    sidebar:{
     DEFAULT:hsl('--sidebar-background'),
     foreground:hsl('--sidebar-foreground'),
     primary:{DEFAULT:hsl('--sidebar-primary'),foreground:hsl('--sidebar-primary-foreground')},
     accent:{DEFAULT:hsl('--sidebar-accent'),foreground:hsl('--sidebar-accent-foreground')},
     border:hsl('--sidebar-border'),
     ring:hsl('--sidebar-ring')
    }
   },
   borderRadius:{lg:'var(--sii-radius)',md:'12px',sm:'9px',xl:'24px'},
   boxShadow:{panel:'var(--sii-shadow)',premium:'0 24px 70px rgba(24,10,17,.16)'},
   fontFamily:{sans:['Inter','ui-sans-serif','system-ui','-apple-system','Segoe UI','sans-serif']},
   keyframes:{
    'fade-up':{'0%':{opacity:'0',transform:'translateY(8px)'},'100%':{opacity:'1',transform:'translateY(0)'}},
    'scale-in':{'0%':{opacity:'0',transform:'scale(.97)'},'100%':{opacity:'1',transform:'scale(1)'}}
   },
   animation:{'fade-up':'fade-up 180ms cubic-bezier(.2,0,0,1) both','scale-in':'scale-in 150ms cubic-bezier(.2,0,0,1) both'}
  }
 },
 plugins:[animate]
};
export default config;
