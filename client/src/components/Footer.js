import React from 'react';
import {
    AppBar,
    Toolbar,
    Typography,
    Button,
    Box,
    Divider
} from '@mui/material';
import packageJson from '../../package.json';
import {
    BugReport as BugReportIcon,
    Code as CodeIcon
} from '@mui/icons-material';

const Footer = () => {
    const GOOGLE_FORM_URL = "https://forms.gle/buBuDvvj4vpe3Fm96";
    const handleReportIssue = () => {
       window.open(GOOGLE_FORM_URL, '_blank');
    };

    return (
        <AppBar 
            position = "static"
            component="footer"
            sx={{
                top:'auto',
                bottom:0,
                mt:'auto',
                backgroundColor:'primary.main',
                color: 'white'
            }}
            >
                <Toolbar sx={{justifyContent: 'space-between', py:1}}>
                    <Box sx={{display:'flex', alignItems: 'center', gap:2}}>
                        <Box sx={{display:'flex', alignItems: 'center', gap:1}}>
                            <CodeIcon sx={{fontsize: 20}} />
                            <Typography variant="body2">
                                Developed by Mr. Jernigan
                            </Typography>
                        </Box>

                        <Divider orientation="vertical" flexItem sx={{bgcolor: 'white',opacity: 0.3}} />


                    </Box>
                    <Box sx={{textAlign:'center'}}>
                        <Typography variant="body2" sx={{opacity:0.8}}>
                            &copy; 2026 RR Tutoring App v.{packageJson.version}
                        </Typography>

                    </Box>
                    <Box sx={{display:'flex', alignItems:'center'}}>
                    <Button
                                
                                color="inherit"
                                startIcon={<BugReportIcon />}
                                onClick={handleReportIssue}
                                sx={{
                                    textTransform:'none',
                                    border:'1px solid rgba(255,255,255,0.3)',
                                    '&:hover':{
                                        backgroundColor: 'rgba(255,255,255,0.1)',
                                        border:'1px solid rgba(255,255,255,0.5)'
                                    }
            
                                }}
                                >Report Issue</Button>
                    </Box>
                </Toolbar>
            </AppBar>
    );
};

export default Footer;
